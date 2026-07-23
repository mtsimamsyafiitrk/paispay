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
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybG9vc3d2Y2JtaXh6ZXJjc29jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzA1NjAsImV4cCI6MjA4ODQwNjU2MH0.Lpcqce_6NHZF3wJnJa-kkMvMTEzb3Mqrb0bP4HO_6DQ';
// SB_HDR: header anon (dipakai untuk upload storage bukti oleh wali/tamu).
const SB_HDR = { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

// ══════════════════════════════════════════
// SUPABASE AUTH (sesi admin)
// Admin login memakai email+password terverifikasi server (Supabase Auth).
// Token JWT admin disimpan di localStorage; sb() memakainya untuk operasi
// tulis. Tanpa token, sb() memakai anon key (hanya bisa baca + kirim laporan
// sesuai kebijakan RLS). Jadi keamanan ditegakkan SERVER, bukan sekadar UI.
// ══════════════════════════════════════════
let sbSession = null;
try { sbSession = JSON.parse(localStorage.getItem('sipay_session') || 'null'); }
catch { sbSession = null; }

function saveSession(s) {
  sbSession = s;
  if (s) localStorage.setItem('sipay_session', JSON.stringify(s));
  else   localStorage.removeItem('sipay_session');
}

function hasAdminSession() {
  return !!(sbSession && sbSession.access_token);
}

// Header untuk request REST: pakai token admin bila ada, jika tidak anon key.
function authHeaders() {
  const token = hasAdminSession() ? sbSession.access_token : SB_KEY;
  return { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token };
}

function _storeSession(data) {
  saveSession({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (Number(data.expires_in || 3600) * 1000),
    user:          data.user || (sbSession && sbSession.user) || null,
  });
}

// Login via password grant → simpan token.
async function sbSignIn(email, password) {
  const r = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'apikey': SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.error || 'Login gagal');
  }
  _storeSession(data);
  return sbSession;
}

// Perbarui token pakai refresh_token. Return true bila berhasil.
async function sbRefresh() {
  if (!sbSession || !sbSession.refresh_token) return false;
  try {
    const r = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ refresh_token: sbSession.refresh_token }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) { saveSession(null); return false; }
    _storeSession(data);
    return true;
  } catch { return false; }
}

async function sbSignOut() {
  if (hasAdminSession()) {
    try { await fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: authHeaders() }); }
    catch { /* best-effort */ }
  }
  saveSession(null);
}

// Ubah password admin yang sedang login (butuh sesi aktif).
async function sbUpdatePassword(newPass) {
  if (!hasAdminSession()) throw new Error('Sesi admin tidak ditemukan — login ulang.');
  const r = await fetch(SB_URL + '/auth/v1/user', {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ password: newPass }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return true;
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

// ── REST helper ──
// Menyisipkan token admin (bila login) & memperbarui token otomatis:
// - proaktif refresh jika token hampir kadaluarsa
// - jika server balas 401, coba refresh sekali lalu ulangi request
async function sb(path, method = 'GET', body = null, extra = {}) {
  if (hasAdminSession() && sbSession.expires_at && Date.now() > sbSession.expires_at - 60000) {
    await sbRefresh();
  }
  const doFetch = () => {
    const opts = { method, headers: { ...authHeaders(), ...extra } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(SB_URL + '/rest/v1/' + path, opts);
  };
  let r = await doFetch();
  if (r.status === 401 && sbSession && sbSession.refresh_token) {
    if (await sbRefresh()) r = await doFetch();
  }
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}

// ── HTML escaping (XSS guard) ──
// esc(): amankan data untuk konteks teks HTML maupun nilai atribut ber-tanda-kutip.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// escJs(): untuk argumen string di dalam handler inline, mis. onclick="fn('${escJs(x)}')".
// HTML-escape saja TIDAK cukup di sini: browser men-decode nilai atribut sebelum
// mesin JS mengeksekusinya, sehingga entity kembali jadi kutip & bisa breakout.
// Solusinya: escape untuk konteks string-JS dulu, lalu HTML-encode hasilnya.
function escJs(v) {
  const j = String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');
  return esc(j);
}

// safeUrl(): hanya izinkan skema http/https/data — cegah href="javascript:...".
function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (/^(https?:|data:image\/)/i.test(s)) return esc(s);
  return '#';
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
