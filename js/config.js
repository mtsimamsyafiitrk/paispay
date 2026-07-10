// ── SiPay · Config, Constants & State ──
// ══════════════════════════════════════════
// DATA
// ══════════════════════════════════════════
const MONTHS = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
const MONTH_FULL = {Jul:'Juli',Agt:'Agustus',Sep:'September',Okt:'Oktober',Nov:'November',Des:'Desember',Jan:'Januari',Feb:'Februari',Mar:'Maret',Apr:'April',Mei:'Mei',Jun:'Juni'};

// No pre-loaded student data — import via Excel atau tambah manual
const STUDENTS_RAW = [];

// Guest mode state (global)
let guestData = { siswa: null, taId: null, taLabel: '', txns: [] };

// ══════════════════════════════════════════
// DATABASE — Supabase (TA-aware)
// ══════════════════════════════════════════
const SB_URL = 'https://urlooswvcbmixzercsoc.supabase.co';
// Kunci anon Supabase memang bersifat publik — keamanan ditegakkan oleh RLS
// (lihat supabase_security.sql), bukan dengan menyembunyikan kunci ini.
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybG9vc3d2Y2JtaXh6ZXJjc29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzA1NjAsImV4cCI6MjA4ODQwNjU2MH0.Lpcqce_6NHZF3wJnJa-kkMvMTEzb3Mqrb0bP4HO_6DQ';

// Token JWT admin aktif (diisi setelah login Supabase Auth). Selama null,
// request berjalan sebagai anon (hanya boleh baca profil/logo + panggil RPC wali).
let sbAuthToken = null;

// ── Sesi Auth (persist di localStorage) ──
function saveSession(data) {
  if (!data || !data.access_token) return;
  sbAuthToken = data.access_token;
  localStorage.setItem('sipay_session', JSON.stringify({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at || (Math.floor(Date.now()/1000) + (data.expires_in || 3600)),
  }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem('sipay_session') || 'null'); }
  catch { return null; }
}
function clearSession() {
  sbAuthToken = null;
  localStorage.removeItem('sipay_session');
}
// Pulihkan token; refresh bila sudah/hampir kedaluwarsa. Return true bila sesi valid.
async function restoreSession() {
  const s = loadSession();
  if (!s || !s.access_token) return false;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at && s.expires_at - now > 60) { sbAuthToken = s.access_token; return true; }
  // Perlu refresh
  try {
    const r = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!r.ok) { clearSession(); return false; }
    saveSession(await r.json());
    return true;
  } catch { sbAuthToken = s.access_token; return true; } // offline: pakai token lama
}

const defaultState = {
  students: [],
  tagihan: [],
  payItems: [
    { id:'spp',         name:'SPP Bulanan',      amount:0,      type:'bulanan', active:true,  kelas:['7','8','9'] },
    { id:'pangkal',     name:'Uang Pangkal',     amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'buku',        name:'Uang Buku',        amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'seragam',     name:'Uang Seragam',     amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'ekskul',      name:'Ekstrakurikuler',  amount:0,      type:'custom',  active:false, kelas:['7','8','9'] },
    { id:'lainnya',     name:'Biaya Lainnya',    amount:0,      type:'custom',  active:false, kelas:['7','8','9'] },
  ],
  transactions: [],
};
const appState = JSON.parse(JSON.stringify(defaultState));

let allTA = [];
let activeTA = null;

// Header REST — pakai JWT admin bila sudah login, jika tidak pakai anon key.
function sbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + (sbAuthToken || SB_KEY),
    ...extra,
  };
}

// ── REST helper ──
async function sb(path, method = 'GET', body = null, extra = {}) {
  const opts = { method, headers: sbHeaders(extra) };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_URL + '/rest/v1/' + path, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}

// ── Panggil fungsi RPC (dipakai mode wali, sebagai anon) ──
async function rpc(fn, args = {}) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(args),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ── Indikator sync ──
function showSyncIndicator(msg, hideAfter = 0) {
  const ind = document.getElementById('syncIndicator');
  if (!ind) return;
  ind.textContent = msg;
  ind.style.opacity = '1';
  if (hideAfter) setTimeout(() => ind.style.opacity = '0', hideAfter);
}

// ══ ACADEMIC YEARS ══
