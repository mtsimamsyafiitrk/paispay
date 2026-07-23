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
const SB_HDR = { 'Content-Type':'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

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
async function sb(path, method = 'GET', body = null, extra = {}) {
  const opts = { method, headers: { ...SB_HDR, ...extra } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_URL + '/rest/v1/' + path, opts);
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
