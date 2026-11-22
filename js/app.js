// HASIL BUILD — jangan diedit langsung. Ubah file di js/, lalu: node scripts/build.js
;// ══ js/config.js ══
// ── SiPay · Config, Constants & State ──
// ══════════════════════════════════════════
// DATA
// ══════════════════════════════════════════
const MONTHS = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
const MONTH_FULL = {Jul:'Juli',Agt:'Agustus',Sep:'September',Okt:'Oktober',Nov:'November',Des:'Desember',Jan:'Januari',Feb:'Februari',Mar:'Maret',Apr:'April',Mei:'Mei',Jun:'Juni'};

// Nama bulan (penuh, singkatan, atau angka periode) → kode bulan internal.
// Dipakai importir data tunggakan yang memakai nama bulan penuh ("Juli") atau
// periode "2024-07".
const MONTH_ALIAS = (() => {
  const map = {};
  MONTHS.forEach(m => { map[m.toLowerCase()] = m; map[MONTH_FULL[m].toLowerCase()] = m; });
  Object.assign(map, { agu:'Agt', ags:'Agt', agst:'Agt', peb:'Feb', pebruari:'Feb', okto:'Okt', nop:'Nov', nopember:'Nov' });
  // Angka bulan kalender (1–12) → kode bulan tahun ajaran (Juli = awal tahun).
  ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']
    .forEach((m, i) => { map[String(i + 1)] = m; map[String(i + 1).padStart(2,'0')] = m; });
  return map;
})();

// monthCode('Juli') → 'Jul'; monthCode('2024-07') → 'Jul'; '' bila tak dikenal.
function monthCode(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  const periode = t.match(/^\d{4}-(\d{2})$/);
  if (periode) return MONTH_ALIAS[periode[1]] || '';
  return MONTH_ALIAS[t.toLowerCase()] || '';
}

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
  // Koneksi Realtime memakai token yang sama — beri tahu agar tidak putus
  // saat token lama kadaluarsa (RLS tabel adalah admin-only).
  if (typeof realtimeSetAuth === 'function') realtimeSetAuth();
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
  } catch {
    // Gagal karena jaringan (bukan karena ditolak server). Sesi yang MASIH
    // berlaku sengaja dipertahankan supaya aplikasi tetap bisa dipakai saat
    // internet putus.
    //
    // Tapi bila tokennya sudah kadaluarsa, kita tidak punya bukti apa pun
    // bahwa sesi ini sah — buang saja. Tanpa ini, token basi yang tertinggal
    // di perangkat cukup dipakai dalam keadaan offline (mis. mode pesawat)
    // untuk membuka seluruh data santri dari cache tanpa password.
    if (!sbSession.expires_at || Date.now() >= sbSession.expires_at) saveSession(null);
    return false;
  }
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
    { id:'pembangunan', name:'Uang Pembangunan', amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'pendaftaran', name:'Uang Pendaftaran', amount:0,      type:'tetap',   active:true,  kelas:['7','8','9'] },
    { id:'buku',        name:'Uang Buku',        amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'seragam',     name:'Uang Seragam',     amount:0,      type:'tetap',   active:false, kelas:['7','8','9'] },
    { id:'ekskul',      name:'Ekstrakurikuler',  amount:0,      type:'custom',  active:false, kelas:['7','8','9'] },
    { id:'lainnya',     name:'Biaya Lainnya',    amount:0,      type:'custom',  active:false, kelas:['7','8','9'] },
  ],
  transactions: [],
};
const appState = JSON.parse(JSON.stringify(defaultState));

// Item "baku": tak bisa dihapus (hanya edit). SPP + item per-siswa.
const BAKU_ITEMS = ['spp', 'pangkal', 'pendaftaran'];
// Item bernominal per-siswa (diatur di form Data Siswa / SPMB / Import Tunggakan,
// disimpan sebagai tagihan per-siswa) — dikecualikan dari pembuatan tagihan
// otomatis & propagasi nominal massal.
const PER_STUDENT_ITEMS = ['pangkal', 'pembangunan', 'pendaftaran'];
// Definisi item baku untuk memastikan selalu ada walau settings lama tak punya.
const BAKU_ITEM_DEFS = [
  { id:'spp',         name:'SPP Bulanan',      amount:0, type:'bulanan', active:true,  kelas:['7','8','9'] },
  { id:'pangkal',     name:'Uang Pangkal',     amount:0, type:'tetap',   active:false, kelas:['7','8','9'] },
  { id:'pendaftaran', name:'Uang Pendaftaran', amount:0, type:'tetap',   active:true,  kelas:['7','8','9'] },
];
// Sisipkan item baku yang belum ada di appState.payItems (mis. install lama).
function ensureBakuItems() {
  let added = false;
  BAKU_ITEM_DEFS.forEach(def => {
    if (!appState.payItems.find(i => i.id === def.id)) { appState.payItems.push({ ...def }); added = true; }
  });
  return added;
}

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

// ── Pustaka Excel (SheetJS) — dimuat saat dibutuhkan ──
// Dulu berkas besar ini ditarik pada SETIAP kali halaman dibuka, padahal yang
// memakainya hanya menu Import & Export. Di jaringan sekolah/seluler itu satu
// unduhan sia-sia yang berebut jalur dengan pemuatan data santri sendiri.
//
// xlsxReady(cb) memuat pustaka sekali lalu menjalankan cb. Bila CDN gagal
// dihubungi, cb TETAP dijalankan dengan window.XLSX undefined — pemanggilnya
// sudah punya jalur cadangan CSV lewat penjagaan `typeof XLSX !== 'undefined'`.
const XLSX_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let _xlsxLoading = null;
function xlsxReady(cb) {
  if (window.XLSX) { cb(); return; }
  if (!_xlsxLoading) {
    _xlsxLoading = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = XLSX_CDN_URL;
      s.async = true;
      s.onload  = () => resolve();
      s.onerror = () => { _xlsxLoading = null; resolve(); };  // biar bisa dicoba lagi
      document.head.appendChild(s);
    });
  }
  _xlsxLoading.then(cb);
}

// ── Indikator sync ──
function showSyncIndicator(msg, hideAfter = 0) {
  const ind = document.getElementById('syncIndicator');
  if (!ind) return;
  setIconText(ind, msg);
  ind.style.opacity = '1';
  if (hideAfter) setTimeout(() => ind.style.opacity = '0', hideAfter);
}

// ══ ACADEMIC YEARS ══
;// ══ js/database.js ══
// ── SiPay · Database Layer (Supabase) ──

// ── Ambil SEMUA baris dengan paginasi ──
// Supabase membatasi jumlah baris per respons API (bawaan: 1000 — lihat
// Dashboard → Settings → API → "Max rows"). Tanpa paginasi, sekolah dengan
// lebih dari 1000 baris tagihan/transaksi akan diam-diam kehilangan sisanya:
// tagihan sebagian santri terlihat KOSONG padahal datanya ada di database.
// Batas ini tidak memunculkan error apa pun — datanya hanya terpotong.
//
// path WAJIB memakai order yang stabil (sertakan kolom unik sebagai pemecah
// seri), kalau tidak ada baris yang bisa terlewat/terhitung dua kali.
//
// Halaman KEDUA dan seterusnya ditarik BERBARENGAN (SB_PAGE_BATCH sekaligus).
// Dulu paginasinya berurutan: halaman ke-4 baru diminta setelah ke-3 tiba, jadi
// waktu tunggunya = jumlah halaman x waktu pulang-pergi jaringan. Di koneksi
// seluler sekolah (RTT 300-600 ms) empat halaman berarti 1,2-2,4 detik yang
// dihabiskan hanya untuk menunggu. Sekarang halaman 2-5 berangkat bersamaan,
// jadi biayanya tinggal satu kali waktu pulang-pergi per gelombang.
//
// Selama halaman terakhir tiap gelombang masih penuh, berarti kemungkinan masih
// ada sisa — lanjut ke gelombang berikutnya. Paling banter ada beberapa
// permintaan kosong di gelombang penutup; jauh lebih murah daripada menunggu
// berurutan.
const SB_PAGE_BATCH = 4;

async function sbAll(path, pageSize = 1000) {
  const sep = path.includes('?') ? '&' : '?';
  const page = (offset) => sb(`${path}${sep}limit=${pageSize}&offset=${offset}`);

  // Halaman pertama sendirian: mayoritas sekolah datanya di bawah 1000 baris,
  // jadi kasus umum tetap satu permintaan saja seperti sebelumnya.
  const first = await page(0);
  if (!Array.isArray(first) || first.length < pageSize) return Array.isArray(first) ? first : [];

  const out = first.slice();
  for (let base = pageSize; ; base += pageSize * SB_PAGE_BATCH) {
    const offsets = Array.from({ length: SB_PAGE_BATCH }, (_, i) => base + i * pageSize);
    const pages = await Promise.all(offsets.map(page));
    let habis = false;
    for (const p of pages) {
      if (!Array.isArray(p) || !p.length) { habis = true; break; }
      out.push(...p);
      if (p.length < pageSize) { habis = true; break; }
    }
    if (habis) break;
  }
  return out;
}

// ══ STUDENTS ══
// Kompatibilitas mundur: kolom spp_history mungkin belum ada bila migrasi
// (supabase_migration_spp_history.sql) belum dijalankan. Bila server menolak
// karena kolom itu tidak ada, flag ini dimatikan agar penyimpanan tetap jalan
// (tanpa riwayat SPP tahun lalu) sampai migrasi dijalankan.
let _sppHistorySupported = true;

// PENGAMAN DATA HILANG: kolom "akumulatif" (spp_paid_months, spp_history,
// status_kelulusan) menyimpan riwayat yang TIDAK bisa dibentuk ulang dari form
// mana pun — mis. tunggakan SPP tahun ajaran sebelumnya. Bila objek siswa yang
// dikirim tidak memuat field itu (mis. dibentuk ulang oleh form edit yang hanya
// tahu nama/kelas/NISN/SPP), kolomnya TIDAK DIKIRIM sama sekali supaya nilai di
// server dipertahankan. Mengirimnya sebagai nilai kosong akan menghapus riwayat
// tunggakan secara permanen.
//   full=true → dipakai simpan massal (POST banyak baris), di mana semua baris
//   wajib berkunci seragam; pemanggilnya selalu memakai objek siswa hasil
//   loadStudents() yang sudah lengkap.
function _buildStudentRow(s, full = false) {
  const row = {
    nama: s.nama,
    kelas: s.kelas,
    nisn: s.nisn || '',
    spp: s.spp || 0,
  };
  const histOk = s.spp_history && typeof s.spp_history === 'object' && !Array.isArray(s.spp_history);
  if (full || Array.isArray(s.spp_paid_months))  row.spp_paid_months  = s.spp_paid_months || [];
  if (full || s.status_kelulusan !== undefined)  row.status_kelulusan = s.status_kelulusan || '';
  if (_sppHistorySupported && (full || histOk))  row.spp_history      = histOk ? s.spp_history : {};
  if (_sppMulaiSupported && (full || s.spp_mulai !== undefined)) row.spp_mulai = s.spp_mulai || '';
  const angsurOk = s.spp_angsur && typeof s.spp_angsur === 'object' && !Array.isArray(s.spp_angsur);
  if (_sppAngsurSupported && (full || angsurOk)) row.spp_angsur = angsurOk ? s.spp_angsur : {};
  return row;
}

// Deteksi error "kolom spp_history belum ada" (PostgREST / schema cache).
function _isMissingSppHistory(e) {
  const msg = String((e && e.message) || e || '');
  return /spp_history/.test(msg);
}

// Idem untuk kolom spp_mulai (supabase_migration_spp_mulai.sql). Bila migrasi
// belum dijalankan, penanda bulan masuk santri baru tidak bisa tersimpan.
//
// DULU kegagalan itu SENYAP: simpan tetap dilaporkan "✅ Tersimpan" padahal
// kolomnya dibuang diam-diam. Akibatnya bulan yang dipilih saat promosi SPMB
// terlihat benar sesaat — nilainya masih ada di memori — lalu hilang begitu
// baris santri ditarik ulang dari server (realtime, polling, atau penyegaran
// santri terpilih di halaman Input Pembayaran), sehingga SPP-nya kembali
// dihitung dari Juli persis seperti sebelum promosi.
//
// Sekarang: (1) admin diberi tahu sekali dengan jelas + peringatan menetap di
// modal promosi, (2) penanda di memori TIDAK ikut terhapus oleh baris server
// yang memang tidak memuat kolomnya, dan (3) flag ini dipasang ulang tiap kali
// data dimuat supaya keadaan pulih sendiri begitu migrasi dijalankan — termasuk
// bila penyebabnya cuma schema cache PostgREST yang sesaat masih basi.
let _sppMulaiSupported = true;
function sppMulaiKolomAda() { return _sppMulaiSupported; }
function _isMissingSppMulai(e) {
  const msg = String((e && e.message) || e || '');
  return /spp_mulai/.test(msg);
}

// Keterangan yang ditampilkan saat kolom penanda belum ada di database.
const SPP_MULAI_MIGRASI_MSG =
  'Kolom "spp_mulai" belum ada di database — jalankan supabase_migration_spp_mulai.sql '
  + 'lewat Supabase → SQL Editor. Sampai itu dilakukan, pilihan "SPP mulai bulan" '
  + 'tidak tersimpan dan SPP kembali dihitung dari Juli.';

let _sppMulaiWarned = false;
function _warnSppMulaiKolomHilang() {
  _sppMulaiSupported = false;
  if (typeof syncSppMulaiWarnBanners === 'function') syncSppMulaiWarnBanners();
  if (_sppMulaiWarned) return;   // cukup sekali per sesi, jangan jadi spam
  _sppMulaiWarned = true;
  console.warn('spp_mulai:', SPP_MULAI_MIGRASI_MSG);
  if (typeof toast === 'function') toast('⚠️ ' + SPP_MULAI_MIGRASI_MSG, 9000);
}

// Dipasang ulang sebelum baris hasil pemuatan diperiksa: bila kolomnya ternyata
// sudah ada, flag tetap true dan fitur langsung jalan lagi tanpa perlu reload.
function _resetSppMulaiSupport() { _sppMulaiSupported = true; }

// Idem untuk kolom spp_angsur (supabase_migration_spp_angsur.sql): nominal SPP
// tahun berjalan yang baru dibayar SEBAGIAN per bulan. Tanpa kolom ini angsuran
// tidak bisa tersimpan — form Input Pembayaran menolak mode angsur SPP tahun
// berjalan (bukannya diam-diam membuang nominalnya).
let _sppAngsurSupported = true;
function sppAngsurKolomAda() { return _sppAngsurSupported; }
function _isMissingSppAngsur(e) {
  const msg = String((e && e.message) || e || '');
  return /spp_angsur/.test(msg);
}
const SPP_ANGSUR_MIGRASI_MSG =
  'Kolom "spp_angsur" belum ada di database — jalankan supabase_migration_spp_angsur.sql '
  + 'lewat Supabase → SQL Editor agar angsuran SPP tahun berjalan bisa disimpan.';

// Kolom students.versi_baris (supabase_migration_konkurensi.sql) naik otomatis
// tiap baris diubah. commitSppOps hanya menulis bila versinya masih sama dengan
// saat dibaca, supaya dua perangkat yang membayar santri yang sama bersamaan
// tidak saling menimpa. Tanpa migrasi: perilaku lama (tanpa penjagaan).
let _versiBarisSupported = true;

// Matikan flag kolom opsional yang ternyata belum ada di server, supaya simpan
// bisa diulang tanpa kolom tersebut. true bila ada flag yang baru dimatikan.
function _degradeMissingColumn(e) {
  if (_sppHistorySupported && _isMissingSppHistory(e)) { _sppHistorySupported = false; return true; }
  if (_sppMulaiSupported   && _isMissingSppMulai(e))   { _warnSppMulaiKolomHilang(); return true; }
  if (_sppAngsurSupported  && _isMissingSppAngsur(e))  { _sppAngsurSupported = false; return true; }
  if (_versiBarisSupported && /versi_baris/.test(String((e && e.message) || e || ''))) { _versiBarisSupported = false; return true; }
  return false;
}

// Kompatibilitas mundur untuk metadata pembayaran (metode / dibayar_oleh /
// tgl_bayar). Bila migrasi supabase_migration_payment_meta.sql belum dijalankan,
// kolom-kolom ini belum ada; flag dimatikan agar simpan tetap jalan tanpa metadata.
let _paymentMetaSupported = true;
function _isMissingPaymentMeta(e) {
  const msg = String((e && e.message) || e || '');
  return /metode|dibayar_oleh|tgl_bayar/.test(msg);
}

// Insert kuitansi dengan fallback bila kolom metadata pembayaran belum ada.
// Bila nomornya ternyata sudah dipakai perangkat lain di detik yang sama
// (indeks unik dari supabase_migration_konkurensi.sql menolaknya), ambil nomor
// berikutnya lalu ulangi. kwtData.no_kuitansi diperbarui ke nomor yang dipakai.
async function insertKuitansi(kwtData) {
  const strip = (o) => { const c = { ...o }; delete c.metode; delete c.dibayar_oleh; delete c.tgl_bayar; return c; };
  for (let coba = 0; ; coba++) {
    const payload = _paymentMetaSupported ? kwtData : strip(kwtData);
    try {
      return await sb('kuitansi', 'POST', payload, { 'Prefer': 'return=representation' });
    } catch(e) {
      const msg = String((e && e.message) || e || '');
      if (_paymentMetaSupported && _isMissingPaymentMeta(e)) { _paymentMetaSupported = false; continue; }
      if (coba < 3 && /23505/.test(msg) && /no_kuitansi/.test(msg)) {
        kwtData.no_kuitansi = await generateNoKuitansi();
        continue;
      }
      throw e;
    }
  }
}

// ── Pemetaan baris server → objek appState ──
// Dipakai bersama oleh loadStudents() dan js/realtime.js, yang menerapkan satu
// baris hasil event WebSocket langsung ke appState. Bentuk objeknya WAJIB sama
// persis lewat kedua jalur itu, jadi pemetaannya cuma boleh ada di satu tempat.
//
// `id` ikut dibawa (dulu dibuang) supaya satu baris bisa dikenali walau namanya
// berubah, dan supaya event DELETE — yang hanya memuat kunci utama — tahu baris
// mana yang harus dihapus.
//
// `prev` = objek santri yang sudah ada di appState untuk baris ini (bila ada).
// Kolom opsional yang TIDAK dibawa baris server — spp_mulai saat migrasinya
// belum jalan — mempertahankan nilai lama alih-alih dikosongkan: baris tanpa
// kolom berarti "server belum mengenal kolom ini", bukan "penandanya memang
// kosong". Tanpa pembedaan ini, satu penyegaran dari server cukup untuk
// menghapus bulan mulai SPP yang baru saja dipilih admin.
function mapStudentRow(r, prev) {
  const adaSppMulai = !!r && Object.prototype.hasOwnProperty.call(r, 'spp_mulai');
  if (r && !adaSppMulai && _sppMulaiSupported) _warnSppMulaiKolomHilang();
  const adaSppAngsur = !!r && Object.prototype.hasOwnProperty.call(r, 'spp_angsur');
  if (r && !adaSppAngsur) _sppAngsurSupported = false;
  return {
    id: r.id,
    nama: r.nama,
    kelas: r.kelas,
    nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    spp_history: (r.spp_history && typeof r.spp_history === 'object' && !Array.isArray(r.spp_history)) ? r.spp_history : {},
    status_kelulusan: r.status_kelulusan || '',
    // Penanda bulan mulai tagih SPP untuk santri yang masuk di tengah TA.
    spp_mulai: adaSppMulai ? (r.spp_mulai || '') : ((prev && prev.spp_mulai) || ''),
    // Angsuran SPP tahun berjalan per bulan: { Agt: 50000 }.
    spp_angsur: adaSppAngsur
      ? ((r.spp_angsur && typeof r.spp_angsur === 'object' && !Array.isArray(r.spp_angsur)) ? r.spp_angsur : {})
      : ((prev && prev.spp_angsur) || {}),
  };
}

async function loadStudents() {
  const rows = await sbAll('students?select=*&order=nama.asc,id.asc');
  // Penanda yang sudah ada di memori dipertahankan bila baris server tidak
  // memuat kolomnya (lihat mapStudentRow). Dicocokkan lewat id lebih dulu agar
  // santri yang baru diganti namanya tetap ketemu.
  const prevById = new Map(), prevByNama = new Map();
  (appState.students || []).forEach(s => {
    if (s.id) prevById.set(s.id, s);
    prevByNama.set(s.nama, s);
  });
  // Dipasang ulang di sini: bila migrasi sudah dijalankan, baris di bawah akan
  // membawa kolomnya dan flag tetap true — tanpa perlu memuat ulang halaman.
  _resetSppMulaiSupport();
  _sppAngsurSupported = true;
  return rows.map(r => mapStudentRow(r, prevById.get(r.id) || prevByNama.get(r.nama)));
}

async function saveSiswa(s) {
  if (!s) return;
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?on_conflict=nama', 'POST', [_buildStudentRow(s)],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    // Jangan laporkan "tersimpan" polos bila penanda bulan mulai SPP terpaksa
    // dibuang — admin berhak tahu bahwa pilihannya tidak ikut tersimpan.
    if (!_sppMulaiSupported && (s.spp_mulai || '')) {
      showSyncIndicator('⚠️ Tersimpan, tapi bulan mulai SPP belum bisa disimpan', 4000);
      _warnSppMulaiKolomHilang();
    } else {
      showSyncIndicator('✅ Tersimpan', 1500);
    }
  } catch(e) {
    if (_degradeMissingColumn(e)) return saveSiswa(s); // ulangi tanpa kolom yang belum ada
    console.error('saveSiswa error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// Rename santri: update baris yang sudah ada (bukan insert baru) + ikut ganti
// nama di tagihan & transaksi agar tidak jadi record yatim / duplikat.
async function renameStudentInDB(origNama, s) {
  if (!s || origNama === s.nama) return saveSiswa(s);
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      _buildStudentRow(s), { 'Prefer': 'return=minimal' });
    await sb('tagihan?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      { nama: s.nama }, { 'Prefer': 'return=minimal' }).catch(e => console.error('rename tagihan:', e));
    await sb('transactions?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      { nama: s.nama }, { 'Prefer': 'return=minimal' }).catch(e => console.error('rename transactions:', e));
    // Sinkron nama tagihan di memori
    appState.tagihan.forEach(t => { if (t.nama === origNama) t.nama = s.nama; });
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    if (_degradeMissingColumn(e)) return renameStudentInDB(origNama, s); // ulangi tanpa kolom yang belum ada
    console.error('renameStudentInDB error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// PERINGATAN: saveState() mengirim SELURUH appState.students. Bila salinan di
// memori sudah usang (device lain menyimpan lebih dulu), datanya ikut tertimpa.
// Untuk operasi massal pakai saveStudentsBatch(daftarYangDisentuh) saja.
async function saveState() {
  showSyncIndicator('💾 Menyimpan...');
  try {
    const rows = appState.students.map(s => _buildStudentRow(s, true));
    await sb('students?on_conflict=nama', 'POST', rows,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch(e) {
    if (_degradeMissingColumn(e)) return saveState(); // ulangi tanpa kolom yang belum ada
    console.error('saveState error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

async function deleteStudentFromDB(nama) {
  try {
    await sb('students?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('deleteStudentFromDB error:', e); }
}

async function deleteTransactionsByNama(nama) {
  try {
    await sb('transactions?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('deleteTransactionsByNama error:', e); }
}

// ══ TAGIHAN ══
function mapTagihanRow(r) {
  return {
    id: r.id,
    nama: r.nama,
    kelas: r.kelas,
    item_id: r.item_id,
    item_name: r.item_name,
    nominal: Number(r.nominal) || 0,
    paid_amount: Number(r.paid_amount) || 0,
  };
}

async function loadTagihan() {
  const rows = await sbAll('tagihan?select=*&order=created_at.asc,id.asc');
  return rows.map(mapTagihanRow);
}

// Buat tagihan untuk satu siswa baru (item tetap aktif yg sesuai kelas).
// Item per-siswa (pangkal/pendaftaran) dikecualikan: nominalnya diatur lewat
// form Data Siswa / SPMB.
async function createTagihanForStudent(student) {
  const items = appState.payItems.filter(i =>
    i.active && i.type === 'tetap' && !PER_STUDENT_ITEMS.includes(i.id) &&
    (i.kelas || []).includes(student.kelas) &&
    !appState.tagihan.find(t => t.nama === student.nama && t.item_id === i.id)
  );
  if (!items.length) return;
  const records = items.map(i => ({
    nama: student.nama, kelas: student.kelas,
    item_id: i.id, item_name: i.name,
    nominal: i.amount || 0, paid_amount: 0,
  }));
  const res = await sb('tagihan', 'POST', records, { 'Prefer': 'return=representation' });
  if (Array.isArray(res)) {
    res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
}

// Buat tagihan untuk semua siswa aktif saat item diaktifkan.
// Item per-siswa (pangkal/pendaftaran) dikecualikan (nominal per-siswa).
async function createTagihanForItem(item) {
  if (PER_STUDENT_ITEMS.includes(item.id)) return 0;
  const sudahAda = new Set(appState.tagihan.filter(t => t.item_id === item.id).map(t => t.nama));
  const students = appState.students.filter(s =>
    !s.status_kelulusan &&
    (item.kelas || []).includes(s.kelas) &&
    !sudahAda.has(s.nama)
  );
  if (!students.length) return 0;
  const records = students.map(s => ({
    nama: s.nama, kelas: s.kelas,
    item_id: item.id, item_name: item.name,
    nominal: item.amount || 0, paid_amount: 0,
  }));
  const res = await sb('tagihan', 'POST', records, { 'Prefer': 'return=representation' });
  if (Array.isArray(res)) {
    res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
  return students.length;
}

// Update paid_amount tagihan (sinkron dengan kuitansi)
async function updateTagihanPaid(tagihanId, newPaidAmount) {
  await sb('tagihan?id=eq.' + tagihanId, 'PATCH',
    { paid_amount: newPaidAmount }, { 'Prefer': 'return=minimal' });
  const idx = appState.tagihan.findIndex(t => t.id === tagihanId);
  if (idx >= 0) appState.tagihan[idx].paid_amount = newPaidAmount;
}

// Update nominal & paid_amount tagihan (admin edit manual)
async function updateTagihanNominal(tagihanId, nominal, paidAmount) {
  await sb('tagihan?id=eq.' + tagihanId, 'PATCH',
    { nominal, paid_amount: paidAmount }, { 'Prefer': 'return=minimal' });
  const idx = appState.tagihan.findIndex(t => t.id === tagihanId);
  if (idx >= 0) {
    appState.tagihan[idx].nominal     = nominal;
    appState.tagihan[idx].paid_amount = paidAmount;
  }
}

// Nominal tagihan item per-siswa saat ini (untuk prefill form). Generik.
function getStudentTagihanNominal(nama, itemId) {
  const t = findTagihan(nama, itemId);
  return t ? (t.nominal || 0) : 0;
}
function getPangkalNominal(nama)      { return getStudentTagihanNominal(nama, 'pangkal'); }
function getPendaftaranNominal(nama)  { return getStudentTagihanNominal(nama, 'pendaftaran'); }

// Set/buat nominal tagihan item per-siswa (acuan dari form Data Siswa / SPMB).
// paid_amount dipertahankan. nominal<=0 tanpa tagihan → tak membuat apa-apa.
async function upsertStudentTagihan(student, itemId, nominal) {
  const val = Math.max(0, Number(nominal) || 0);
  const existing = findTagihan(student.nama, itemId);
  if (existing) {
    if ((existing.nominal || 0) === val) return;
    await updateTagihanNominal(existing.id, val, existing.paid_amount || 0);
    return;
  }
  if (val <= 0) return;
  const item = appState.payItems.find(i => i.id === itemId);
  const rec = {
    nama: student.nama, kelas: student.kelas,
    item_id: itemId, item_name: item ? item.name : itemId,
    nominal: val, paid_amount: 0,
  };
  const res = await sb('tagihan', 'POST', [rec], { 'Prefer': 'return=representation' });
  if (Array.isArray(res) && res[0]) {
    appState.tagihan.push({
      id: res[0].id, nama: res[0].nama, kelas: res[0].kelas,
      item_id: res[0].item_id, item_name: res[0].item_name,
      nominal: Number(res[0].nominal) || 0, paid_amount: Number(res[0].paid_amount) || 0,
    });
  }
}
function upsertPangkalTagihan(student, nominal)     { return upsertStudentTagihan(student, 'pangkal', nominal); }
function upsertPendaftaranTagihan(student, nominal) { return upsertStudentTagihan(student, 'pendaftaran', nominal); }

// Perbarui nominal SEMUA tagihan satu item (saat admin ubah nominal item).
// paid_amount tiap santri dipertahankan; sisa dihitung ulang dari nominal baru.
async function updateTagihanNominalByItem(itemId, newNominal) {
  const rows = appState.tagihan.filter(t => t.item_id === itemId);
  if (!rows.length) return 0;
  await sb('tagihan?item_id=eq.' + encodeURIComponent(itemId), 'PATCH',
    { nominal: newNominal }, { 'Prefer': 'return=minimal' });
  rows.forEach(t => { t.nominal = newNominal; });
  return rows.length;
}

// Simpan banyak tagihan sekaligus (dipakai Import Tunggakan).
// rows: array { id?, nama, kelas, item_id, item_name, nominal, paid_amount }.
// Baris ber-id = memperbarui record lama (upsert lewat primary key), baris tanpa
// id = record baru. Keduanya dikirim terpisah karena PostgREST memakai satu
// daftar kolom untuk seluruh batch (id null akan melanggar primary key).
async function upsertTagihanBatch(rows) {
  const toRow = r => ({
    nama: r.nama, kelas: r.kelas || '', item_id: r.item_id, item_name: r.item_name,
    nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
  });
  const baru = rows.filter(r => !r.id);
  const lama = rows.filter(r => r.id);

  if (lama.length) {
    await sb('tagihan?on_conflict=id', 'POST', lama.map(r => ({ id: r.id, ...toRow(r) })),
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    lama.forEach(r => {
      const t = appState.tagihan.find(x => x.id === r.id);
      if (t) { t.nominal = Number(r.nominal) || 0; t.paid_amount = Number(r.paid_amount) || 0; t.kelas = r.kelas || t.kelas; }
    });
  }
  if (baru.length) {
    const res = await sb('tagihan', 'POST', baru.map(toRow), { 'Prefer': 'return=representation' });
    if (Array.isArray(res)) res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
  return rows.length;
}

// Upsert banyak siswa sekaligus tanpa mengirim seluruh appState.students
// (saveState mengirim semuanya; ini dipakai import agar payload tetap kecil).
async function saveStudentsBatch(list) {
  if (!list || !list.length) return;
  try {
    await sb('students?on_conflict=nama', 'POST', list.map(s => _buildStudentRow(s, true)),
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) {
    if (_degradeMissingColumn(e)) return saveStudentsBatch(list); // ulangi tanpa kolom yang belum ada
    throw e;
  }
}

// Hapus semua tagihan satu item (saat admin pilih "hapus record")
async function deleteTagihanByItemId(itemId) {
  await sb('tagihan?item_id=eq.' + encodeURIComponent(itemId), 'DELETE', null, { 'Prefer': 'return=minimal' });
  appState.tagihan = appState.tagihan.filter(t => t.item_id !== itemId);
}

// Hapus semua tagihan satu siswa (saat siswa dihapus)
async function deleteTagihanByNama(nama) {
  try {
    await sb('tagihan?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
    appState.tagihan = appState.tagihan.filter(t => t.nama !== nama);
  } catch(e) { console.error('deleteTagihanByNama error:', e); }
}

// Helper: cari tagihan siswa untuk satu item
function findTagihan(nama, itemId) {
  // tagihanOf() memakai indeks per-nama saat penggambaran tabel sedang berjalan
  // (lihat withTagihanIndex di js/helpers.js); di luar itu tetap memindai array.
  const list = (typeof tagihanOf === 'function')
    ? tagihanOf(nama) : appState.tagihan.filter(t => t.nama === nama);
  return list.find(t => t.item_id === itemId) || null;
}

// ══ TRANSACTIONS ══
function mapTransactionRow(r) {
  return {
    id: r.id,
    nama: r.nama, kelas: r.kelas, jenis: r.jenis,
    nominal: Number(r.nominal) || 0, time: r.time, catatan: r.catatan || '',
    metode: r.metode || '', dibayar_oleh: r.dibayar_oleh || '',
  };
}

// ── Hanya transaksi TERAKHIR yang ditarik ──
// appState.transactions cuma dipakai satu tempat: daftar "10 transaksi
// terakhir" di Dashboard. Setiap tampilan yang butuh riwayat penuh menarik
// datanya sendiri dari server — halaman Log (js/siswa.js), Export & Backup
// (js/cetak.js), dan riwayat per santri (getAllTransactionsByStudent di
// js/helpers.js). Dulu tabel ini ditarik UTUH pada tiap sinkron, dengan
// paginasi 1000 baris sekali jalan; setelah setahun dipakai itu bisa ribuan
// baris yang diunduh hanya untuk menampilkan sepuluh di antaranya.
//
// Diambil menurun lalu dibalik, supaya isi array tetap MENAIK seperti dulu:
// Dashboard memakai slice(-10) dan js/realtime.js menambahkan baris baru di
// ujung belakang. Kolom created_at selalu terisi (DEFAULT now(); aplikasi tidak
// pernah mengirimnya sendiri), jadi urutannya tidak perlu penanganan NULL.
const TXN_TERAKHIR_LIMIT = 50;   // longgar di atas 10, untuk berjaga bila ada baris terhapus

async function loadTransactions() {
  const rows = await sb('transactions?select=*&order=created_at.desc,id.desc' +
                        '&limit=' + TXN_TERAKHIR_LIMIT);
  return Array.isArray(rows) ? rows.map(mapTransactionRow).reverse() : [];
}

async function saveTransaction(t) {
  const row = {
    nama: t.nama, kelas: t.kelas, jenis: t.jenis,
    nominal: t.nominal || 0, time: t.time, catatan: t.catatan || '',
  };
  if (_paymentMetaSupported) {
    row.metode = t.metode || '';
    row.dibayar_oleh = t.dibayar_oleh || '';
  }
  try {
    // return=representation supaya id baris tersimpan ikut kembali. Objek txn
    // yang sama sudah lebih dulu masuk ke appState.transactions (lihat
    // submitPayment); dengan id terpasang, event realtime untuk baris itu
    // dikenali sebagai baris yang sudah ada — bukan transaksi kedua.
    const res = await sb('transactions', 'POST', row, { 'Prefer': 'return=representation' });
    if (Array.isArray(res) && res[0] && res[0].id) t.id = res[0].id;
  } catch(e) {
    if (_paymentMetaSupported && _isMissingPaymentMeta(e)) {
      _paymentMetaSupported = false;
      return saveTransaction(t); // ulangi tanpa kolom metadata pembayaran
    }
    console.error('saveTransaction error:', e);
  }
}

// ══ SETTINGS ══
// Penanda apakah settings sempat dibaca dari server pada sesi ini. Bila belum
// (mis. device baru yang gagal memuat), saveSettings TIDAK boleh mengirim
// profil/akun/logo dari localStorage yang masih kosong — kalau dikirim, profil
// madrasah yang sudah diisi di device lain ikut terhapus.
let _settingsLoaded = false;

async function loadSettings() {
  try {
    const rows = await sb('settings?select=*');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    if (Array.isArray(map.payItems) && map.payItems.length) appState.payItems = map.payItems;
    if (map.profil && Object.keys(map.profil).length)
      localStorage.setItem('sipay_profil', JSON.stringify(map.profil));
    if (map.logo)
      localStorage.setItem('sipay_logo', map.logo);
    if (map.akun && map.akun.user) {
      // Password tidak lagi disimpan di settings (dikelola Supabase Auth).
      const cleanAkun = { user: map.akun.user, email: map.akun.email || '', hp: map.akun.hp || '' };
      localStorage.setItem('sipay_akun', JSON.stringify(cleanAkun));
      localStorage.setItem('sipay_admin', JSON.stringify({ user: cleanAkun.user }));
    }
    _settingsLoaded = true;
  } catch(e) { console.error('loadSettings error:', e); }
}

async function saveSettings() {
  const profil  = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const akunRaw = JSON.parse(localStorage.getItem('sipay_akun')   || '{}');
  // Jangan pernah menulis password ke settings (dibaca anon). Simpan hanya kontak.
  const akun    = { user: akunRaw.user || 'Admin', email: akunRaw.email || '', hp: akunRaw.hp || '' };
  const logo    = localStorage.getItem('sipay_logo') || '';
  try {
    const records = [{ key: 'payItems', value: appState.payItems }];
    // Hanya kirim profil/akun/logo bila memang ada isinya DAN settings server
    // sudah pernah terbaca — supaya device yang datanya belum tersinkron tidak
    // menimpa isian device lain dengan nilai kosong.
    if (_settingsLoaded && Object.keys(profil).length) records.push({ key: 'profil', value: profil });
    if (_settingsLoaded && akunRaw.user)              records.push({ key: 'akun',   value: akun });
    if (_settingsLoaded && logo)                      records.push({ key: 'logo',   value: logo });
    await sb('settings?on_conflict=key', 'POST', records,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) { console.error('saveSettings error:', e); }
}

// ══ SINKRONISASI LINTAS DEVICE ══
// Semua penulisan di bawah ini membaca kondisi TERBARU di server lebih dulu,
// lalu menggabungkannya dengan perubahan yang baru dibuat. Tanpa ini,
// salinan di memori device B (yang bisa saja sudah usang karena device A
// menyimpan lebih dulu) akan menimpa hasil input device A.

// Terapkan perubahan pembayaran SPP sebagai SELISIH di atas kondisi TERBARU
// server (SPP tahun berjalan, angsurannya, dan riwayat TA lalu sekaligus).
//   ops.cur  : [{ m, delta }]       → tambah/kurangi nominal bulan tahun berjalan
//              [{ m, add:true }]    → tandai lunas penuh
//              [{ m, remove:true }] → batalkan bulan (kembali belum dibayar)
//   ops.hist : [{ ta, m, delta, rate }] → tambah/kurangi nominal bulan TA lalu
// Lihat applySppCurDelta() / applySppHistDelta() di helpers.js.
async function commitSppOps(nama, ops = {}, coba = 0) {
  const cur  = ops.cur  || [];
  const hist = ops.hist || [];
  if (!cur.length && !hist.length) return;
  const local = appState.students.find(s => s.nama === nama) || null;

  const apply = (obj) => {
    cur.forEach(o => {
      if (o.add)         applySppCurDelta(obj, o.m, Infinity);
      else if (o.remove) applySppCurRemove(obj, o.m);
      else               applySppCurDelta(obj, o.m, Number(o.delta) || 0);
    });
    hist.forEach(o => applySppHistDelta(obj, o.ta, o.m, Number(o.delta) || 0, o.rate));
  };

  let server = null, serverOk = false;
  try {
    const cols = ['spp', 'spp_paid_months'];
    if (_sppHistorySupported) cols.push('spp_history');
    if (_sppAngsurSupported)  cols.push('spp_angsur');
    if (_versiBarisSupported) cols.push('versi_baris');
    const rows = await sb('students?select=' + cols.join(',') + '&nama=eq.' + encodeURIComponent(nama));
    server = (rows && rows[0]) || null;
    serverOk = true;
  } catch(e) {
    if (_degradeMissingColumn(e)) return commitSppOps(nama, ops);
    console.error('commitSppOps read:', e);
  }

  // Server tak terbaca → gagalkan (pemanggil yang memberi tahu admin). Jangan
  // menulis dari salinan lokal yang mungkin usang.
  if (!serverOk) throw new Error('Data santri tidak bisa dibaca dari server');
  // Baris belum ada di server (santri baru yang gagal tersimpan) → simpan biasa.
  if (!server) {
    if (local) { apply(local); return saveSiswa(local); }
    return;
  }

  const obj = {
    spp: Number(server.spp) || Number(local && local.spp) || 0,
    spp_paid_months: Array.isArray(server.spp_paid_months) ? [...server.spp_paid_months]
      : [...((local && local.spp_paid_months) || [])],
    spp_angsur: JSON.parse(JSON.stringify(
      (_sppAngsurSupported && server.spp_angsur && typeof server.spp_angsur === 'object' && !Array.isArray(server.spp_angsur))
        ? server.spp_angsur : ((local && local.spp_angsur) || {}))),
    spp_history: JSON.parse(JSON.stringify(
      (_sppHistorySupported && server.spp_history && typeof server.spp_history === 'object' && !Array.isArray(server.spp_history))
        ? server.spp_history : ((local && local.spp_history) || {}))),
  };
  apply(obj);

  const patch = { spp_paid_months: obj.spp_paid_months };
  if (_sppHistorySupported) patch.spp_history = obj.spp_history;
  if (_sppAngsurSupported)  patch.spp_angsur  = obj.spp_angsur;

  showSyncIndicator('💾 Menyimpan...');
  try {
    const dijaga = _versiBarisSupported && server.versi_baris != null;
    const hasil = await sb('students?nama=eq.' + encodeURIComponent(nama)
      + (dijaga ? '&versi_baris=eq.' + server.versi_baris : ''), 'PATCH', patch,
      { 'Prefer': dijaga ? 'return=representation' : 'return=minimal' });
    if (dijaga && Array.isArray(hasil) && !hasil.length) {
      // Perangkat lain mengubah santri ini di antara baca & tulis → ulangi di
      // atas data terbarunya.
      if (coba < 4) return commitSppOps(nama, ops, coba + 1);
      throw new Error('Data santri terus berubah dari perangkat lain, coba lagi');
    }
    if (local) {
      local.spp_paid_months = obj.spp_paid_months;
      if (_sppHistorySupported) local.spp_history = obj.spp_history;
      if (_sppAngsurSupported)  local.spp_angsur  = obj.spp_angsur;
    }
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    if (_degradeMissingColumn(e)) return commitSppOps(nama, ops, coba);
    console.error('commitSppOps error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
    throw e;
  }
}

// Tambah pembayaran tagihan sebagai SELISIH (delta) di atas nilai terbaru di
// server, bukan menimpa dengan angka hasil hitungan lokal.
async function addTagihanPaid(tagihanId, delta) {
  // Utamakan fungsi database (satu perintah UPDATE paid_amount = paid_amount +
  // delta), supaya dua perangkat yang membayar bersamaan tidak saling menimpa.
  if (_tagihanRpcSupported) {
    try {
      const baru = await sb('rpc/tambah_tagihan_paid', 'POST', { p_id: tagihanId, p_delta: Number(delta) || 0 });
      const idx = appState.tagihan.findIndex(t => t.id === tagihanId);
      if (idx >= 0 && baru != null) appState.tagihan[idx].paid_amount = Number(baru) || 0;
      return;
    } catch(e) {
      // Fungsi belum dibuat (migrasi belum dijalankan) → jalur lama.
      if (!/PGRST202|tambah_tagihan_paid/.test(String((e && e.message) || e || ''))) throw e;
      _tagihanRpcSupported = false;
    }
  }
  const local = appState.tagihan.find(t => t.id === tagihanId) || null;
  let base = null;
  try {
    const rows = await sb('tagihan?select=paid_amount&id=eq.' + tagihanId);
    if (rows && rows[0]) base = Number(rows[0].paid_amount) || 0;
  } catch(e) { console.error('addTagihanPaid read:', e); }
  if (base == null) base = local ? (Number(local.paid_amount) || 0) : 0;
  return updateTagihanPaid(tagihanId, Math.max(0, base + (Number(delta) || 0)));
}
let _tagihanRpcSupported = true;

// ── Riwayat/tunggakan SPP tahun ajaran sebelumnya (kolom students.spp_history) ──
// Dipakai editor "Tunggakan TA Lama". Sengaja memakai PATCH kolom tunggal:
// riwayat ini tidak bisa dibentuk ulang dari kuitansi (bulan yang belum pernah
// dibayar tak meninggalkan jejak), jadi jangan pernah ikut mengirim kolom lain
// dari salinan memori yang mungkin sudah usang.

const SPP_HISTORY_BELUM_SIAP =
  'Kolom spp_history belum ada di database. Jalankan supabase_migration_spp_history.sql ' +
  'di Supabase → SQL Editor lebih dulu.';

// Baca spp_history satu santri langsung dari server (bukan dari appState) agar
// editor selalu mulai dari kondisi terakhir, termasuk hasil input device lain.
// Return: objek riwayat, atau null bila barisnya belum ada di server.
async function loadSppHistory(nama) {
  if (!_sppHistorySupported) throw new Error(SPP_HISTORY_BELUM_SIAP);
  let rows;
  try {
    rows = await sb('students?select=spp_history&nama=eq.' + encodeURIComponent(nama));
  } catch(e) {
    if (_isMissingSppHistory(e)) { _sppHistorySupported = false; throw new Error(SPP_HISTORY_BELUM_SIAP); }
    throw e;
  }
  if (!rows || !rows[0]) return null;
  const h = rows[0].spp_history;
  return (h && typeof h === 'object' && !Array.isArray(h)) ? h : {};
}

// Tulis spp_history satu santri (menimpa, sesuai isi editor).
async function saveSppHistory(nama, hist) {
  if (!_sppHistorySupported) throw new Error(SPP_HISTORY_BELUM_SIAP);
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?nama=eq.' + encodeURIComponent(nama), 'PATCH',
      { spp_history: hist }, { 'Prefer': 'return=minimal' });
  } catch(e) {
    if (_isMissingSppHistory(e)) { _sppHistorySupported = false; }
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
    throw e;
  }
  const local = appState.students.find(s => s.nama === nama);
  if (local) local.spp_history = hist;
  showSyncIndicator('✅ Tersimpan', 1500);
}

// Ambil ulang satu santri + tagihannya dari server (dipakai saat santri dipilih
// di form Input Pembayaran, supaya bulan/tagihan yang baru dilunasi di device
// lain langsung terlihat). Return true bila ada perubahan.
async function refreshStudent(nama) {
  if (!nama) return false;
  let rows, tRows;
  try {
    [rows, tRows] = await Promise.all([
      sb('students?select=*&nama=eq.' + encodeURIComponent(nama)),
      sb('tagihan?select=*&nama=eq.' + encodeURIComponent(nama)),
    ]);
  } catch(e) { console.error('refreshStudent error:', e); return false; }
  if (!rows || !rows[0]) return false;

  const idx = appState.students.findIndex(s => s.nama === nama);
  // Pemetaannya HARUS lewat mapStudentRow, bukan disalin ulang di sini: itulah
  // satu-satunya tempat yang tahu cara mempertahankan kolom opsional yang tidak
  // dibawa baris server. Versi lama menyalin manual dan menulis
  // `spp_mulai: r.spp_mulai || ''`, sehingga penyegaran ini — yang berjalan
  // tepat saat santri dipilih di Input Pembayaran — menghapus bulan mulai SPP
  // hasil promosi SPMB dan mengembalikan tagihan ke Juli.
  const fresh = mapStudentRow(rows[0], idx >= 0 ? appState.students[idx] : null);
  const freshTagihan = (tRows || []).map(t => ({
    id: t.id, nama: t.nama, kelas: t.kelas,
    item_id: t.item_id, item_name: t.item_name,
    nominal: Number(t.nominal) || 0, paid_amount: Number(t.paid_amount) || 0,
  }));

  const before = JSON.stringify([idx >= 0 ? appState.students[idx] : null,
                                appState.tagihan.filter(t => t.nama === nama)]);
  if (idx >= 0) appState.students[idx] = fresh; else appState.students.push(fresh);
  appState.tagihan = appState.tagihan.filter(t => t.nama !== nama).concat(freshTagihan);
  return before !== JSON.stringify([fresh, freshTagihan]);
}

// ── Bersihkan seluruh jejak data di perangkat ──
// Dipakai saat logout DAN saat halaman dibuka tanpa sesi yang sah. Dua-duanya
// perlu: 'sipay_state' berisi salinan lengkap data santri (nama, NISN, riwayat
// pembayaran) dalam teks biasa, dan dulu tetap tertinggal setelah admin keluar
// — di komputer yang dipakai bergantian, sisa itu terbaca pengguna berikutnya.
//
// 'sipay_profil' & 'sipay_logo' sengaja DIPERTAHANKAN: isinya branding madrasah
// yang memang boleh dibaca publik (lihat policy "public_brand"), dan layar login
// memakainya sebelum settings dari server termuat.
function clearLocalData() {
  localStorage.removeItem('sipay_state');   // data santri
  localStorage.removeItem('sipay_akun');    // email & HP admin
  localStorage.removeItem('sipay_admin');   // label nama admin
  appState.students     = [];
  appState.transactions = [];
  appState.tagihan      = [];
  // Gambar ulang supaya tabel yang sempat terisi tidak tertinggal di DOM —
  // layar login hanyalah lapisan tampilan, isi di baliknya tetap bisa dibuka.
  try {
    renderDashboard();
    renderSiswaTable();
    renderTunggakan();
    renderCetakNamaOptions();
  } catch { /* halaman belum siap — tidak apa-apa */ }
}

// ── Load semua data ──
// opts.silent = sinkronisasi latar belakang (tanpa spanduk "Memuat data...",
// dan pilihan pada dropdown Cetak dipertahankan).
async function loadDataForTA(opts = {}) {
  const silent = !!opts.silent;
  if (!silent) showSyncIndicator('⏳ Memuat data...');
  try {
    const [students, transactions, tagihan] = await Promise.all([
      loadStudents(), loadTransactions(), loadTagihan()
    ]);
    appState.students     = students;
    appState.transactions = transactions;
    appState.tagihan      = tagihan;
    simpanSalinanLokal(!silent);
    if (!silent) showSyncIndicator('✅ Data dimuat', 2000);
    const gi = document.getElementById('gasIcon'); if(gi) gi.className = 'status-dot ok';
    const gl = document.getElementById('gasLabel');
    // "Realtime" bila WebSocket aktif, "Terhubung" bila hanya polling.
    if (gl) gl.textContent = (typeof connStatusLabel === 'function') ? connStatusLabel() : 'Terhubung';
    const syncEl = document.getElementById('lastSyncTime');
    if (syncEl) syncEl.textContent = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  } catch(e) {
    if (!silent) showSyncIndicator('⚠️ Gagal memuat', 3000);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.className = 'status-dot off';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    throw e;
  }
  renderHalamanAktif();
  if (silent && typeof refreshInputPageIfIdle === 'function') refreshInputPageIfIdle();
}

// ── Salinan lokal (cadangan saat offline) ──
// Menulisnya berarti men-serialisasi SELURUH data santri + transaksi + tagihan
// menjadi teks — pekerjaan yang menahan thread utama. Dulu itu dilakukan pada
// setiap sinkron, termasuk sinkron latar tiap 20 detik, padahal salinan ini
// hanya dipakai ketika aplikasi dibuka tanpa koneksi.
//
// Sekarang: ditulis pada pemuatan/sinkron manual (force), selain itu paling
// sering sekali per menit. js/sync.js juga memaksa penulisan saat tab
// ditinggalkan, jadi salinannya tidak pernah tertinggal jauh.
const SNAPSHOT_MIN_GAP_MS = 60000;
let _snapshotAt = 0;

function simpanSalinanLokal(force = false) {
  // HANYA untuk admin yang sedang login. Tanpa penjagaan ini, sesi apa pun bisa
  // meninggalkan data santri di perangkat.
  if (!hasAdminSession()) return;
  if (!force && Date.now() - _snapshotAt < SNAPSHOT_MIN_GAP_MS) return;
  try {
    localStorage.setItem('sipay_state', JSON.stringify({
      students: appState.students,
      transactions: appState.transactions,
      tagihan: appState.tagihan,
      payItems: appState.payItems,
      savedAt: new Date().toISOString(),
    }));
    _snapshotAt = Date.now();
  } catch { /* quota exceeded */ }
}

// Isi ulang dropdown nama di halaman Cetak tanpa menghilangkan pilihan aktif.
function renderCetakNamaOptions() {
  const sel = document.getElementById('cetakNama');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s =>`<option value="${esc(s.nama)}">${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('');
  if (prev && appState.students.some(s => s.nama === prev)) sel.value = prev;
}

async function initApp() {
  showSyncIndicator('⏳ Memuat data...');
  try { await loadSettings(); } catch(e) { console.error('loadSettings error:', e); }
  // Gambar ulang profil: init.js sempat memanggilnya SEBELUM settings server
  // termuat, jadi device baru masih menampilkan nilai bawaan (nama madrasah,
  // logo, tahun ajaran) sampai halaman di-reload.
  if (typeof applyProfil === 'function') applyProfil();
  // Pastikan item baku (SPP/Pangkal/Pendaftaran) ada; persist bila admin login.
  if (ensureBakuItems() && hasAdminSession()) saveSettings().catch(() => {});
  try {
    await loadDataForTA();
  } catch(e) {
    console.error('loadDataForTA error:', e);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.className = 'status-dot off';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    // Salinan lokal hanya boleh dipulihkan untuk admin yang memegang sesi.
    // Dulu blok ini berjalan tanpa syarat: pengunjung tanpa login pun membuat
    // server menolak (401) lalu data santri dari cache digambar penuh di balik
    // layar login — bisa dilihat siapa saja tanpa password lewat menu Inspect.
    if (hasAdminSession()) {
      showSyncIndicator('⚠️ Offline — pakai data lokal', 3000);
      const saved = JSON.parse(localStorage.getItem('sipay_state') || 'null');
      if (saved?.students)         appState.students     = saved.students;
      if (saved?.transactions)     appState.transactions = saved.transactions;
      if (saved?.tagihan)          appState.tagihan      = saved.tagihan;
      if (saved?.payItems?.length) appState.payItems     = saved.payItems;
    } else {
      clearLocalData();
    }
  }
  renderHalamanAktif();
  loadTemplateKuitansi().catch(()=>{});
  const t1 = document.getElementById('cetakTanggal');
  const t2 = document.getElementById('cetakTanggalTotal');
  if (t1) t1.value = new Date().toISOString().split('T')[0];
  if (t2) t2.value = new Date().toISOString().split('T')[0];
}
;// ══ js/tahun-ajaran.js ══
// ── SiPay · Tahun Ajaran — dihapus, file ini dikosongkan ──
// Fitur pemisahan tahun ajaran telah dihilangkan.
// Semua data siswa, transaksi, dan laporan kini digabung tanpa filter tahun ajaran.
;// ══ js/helpers.js ══
// ── SiPay · Helpers, Nav & Student Utilities ──
const rp = n => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const pct = (a,b) => b ? Math.round(a/b*100) : 0;

function kelasLabel(s) {
  const sk = s.status_kelulusan || '';
  if (sk === 'calon')  return 'Calon Santri';
  if (sk === 'lulus')  return 'Lulus';
  if (sk === 'pindah') return 'Pindah';
  if (sk === 'keluar') return 'Keluar';
  return s.kelas;
}

// Santri AKTIF = yang sedang belajar sekarang: status_kelulusan kosong.
// Baris santri tidak pernah dihapus saat lulus/pindah/keluar — statusnya saja
// yang berubah — dan calon santri SPMB juga tinggal di tabel yang sama. Jadi
// jumlah baris ≠ jumlah santri aktif, dan tiap statistik "santri" harus
// menyaring lewat helper ini.
const STATUS_NON_AKTIF = { calon: 'calon santri', lulus: 'alumni', pindah: 'pindah', keluar: 'keluar' };
function isSantriAktif(s) { return !!s && !s.status_kelulusan; }
function santriAktif(list) { return (list || appState.students).filter(isSantriAktif); }

function terbilang(n) {
  n = Math.floor(n);
  if (n === 0) return '';
  const satuan = ['','Satu','Dua','Tiga','Empat','Lima','Enam','Tujuh','Delapan','Sembilan',
    'Sepuluh','Sebelas','Dua Belas','Tiga Belas','Empat Belas','Lima Belas','Enam Belas',
    'Tujuh Belas','Delapan Belas','Sembilan Belas'];
  const puluhan = ['','','Dua Puluh','Tiga Puluh','Empat Puluh','Lima Puluh',
    'Enam Puluh','Tujuh Puluh','Delapan Puluh','Sembilan Puluh'];
  if (n < 20) return satuan[n];
  if (n < 100) return puluhan[Math.floor(n/10)] + (n%10 > 0 ? ' ' + satuan[n%10] : '');
  if (n < 200) return 'Seratus' + (n%100 > 0 ? ' ' + terbilang(n%100) : '');
  if (n < 1000) return satuan[Math.floor(n/100)] + ' Ratus' + (n%100 > 0 ? ' ' + terbilang(n%100) : '');
  if (n < 2000) return 'Seribu' + (n%1000 > 0 ? ' ' + terbilang(n%1000) : '');
  if (n < 1000000) return terbilang(Math.floor(n/1000)) + ' Ribu' + (n%1000 > 0 ? ' ' + terbilang(n%1000) : '');
  if (n < 1000000000) return terbilang(Math.floor(n/1000000)) + ' Juta' + (n%1000000 > 0 ? ' ' + terbilang(n%1000000) : '');
  return terbilang(Math.floor(n/1000000000)) + ' Miliar' + (n%1000000000 > 0 ? ' ' + terbilang(n%1000000000) : '');
}

function terbilangFull(n) {
  if (!n || n === 0) return 'Nol Rupiah';
  return terbilang(Math.floor(n)) + ' Rupiah';
}

// Emoji di awal pesan teks -> ikon garis dari sprite (index.html). Teks tetap
// dimasukkan sebagai text node, jadi aman untuk isi dari pengguna.
const EMOJI_ICON = {'💾':'save','🗑':'trash','✏':'edit','✍':'edit','🔄':'refresh','🎓':'grad','📥':'download','📤':'upload','🖨':'print','✅':'check','❌':'x','📋':'clip','💳':'card','📁':'folder','🔍':'search','➕':'plus','🔐':'lock','📄':'file','👁':'eye','🗓':'cal','💵':'cash','🏦':'bank','🛒':'cart','🩺':'pulse','📊':'chart','📦':'box','🧪':'flask','⚡':'zap','📌':'pin','⚠':'alert','⏳':'clock','⌛':'clock','📖':'book','✉':'mail','👥':'users','👤':'user','💡':'info','ℹ':'info','👆':'info','👋':'info','⭐':'star','📱':'phone','📞':'phone','🚪':'logout','💬':'msg','🔗':'link','📂':'folder','🗂':'folder','🧾':'file','🏫':'bank','🏛':'bank','💰':'cash','🎉':'check','📅':'cal','🔒':'lock'};
function setIconText(el, msg) {
  msg = String(msg ?? '');
  const m = msg.match(/^(\p{Extended_Pictographic})\uFE0F?\s*/u);
  const name = m && EMOJI_ICON[m[1]];
  if (!name) { el.textContent = msg; return; }
  el.innerHTML = `<svg class="ic"><use href="#i-${name}"/></svg> `;
  el.append(msg.slice(m[0].length));
}
function toast(msg, dur=2500) {
  const t = document.getElementById('toast');
  setIconText(t, msg); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── Nav ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-'+id);
  if (!pageEl) return;
  pageEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if(n.getAttribute('onclick') && n.getAttribute('onclick').includes("'"+id+"'")) n.classList.add('active');
  });
  // Grup Pengaturan dilipat secara default; buka otomatis bila halamannya aktif
  if (document.querySelector('#navPengaturan .nav-item.active')) document.getElementById('navPengaturan').classList.remove('collapsed');
  const titles = {dashboard:['Dashboard','Ringkasan pembayaran santri'],input:['Input Pembayaran','Catat pembayaran santri'],
    'rekap-siswa':['Data Santri','Seluruh data siswa & status bayar'],tunggakan:['Tunggakan','Daftar santri yang belum melunasi'],
    spmb:['SPMB','Sistem Penerimaan Murid Baru — kelola calon santri'],
    pengaturan:['Kelola Item Bayar','Atur item pembayaran'],cetak:['Cetak / PDF','Export rekap dan surat tagihan'],'tahun-ajaran':['Tahun Ajaran','Kelola & pindah tahun ajaran'],akun:['Akun Admin','Pengaturan akun & keamanan'],
    pengunjung:['Info Pembayaran','Detail pembayaran & tunggakan santri'],
    lapor:['Lapor Pembayaran','Laporkan pembayaran yang belum terdata'],
    'laporan-masuk':['Laporan Masuk','Verifikasi laporan pembayaran dari wali santri'],
    'template-kuitansi':['Template Kuitansi','Atur tampilan kuitansi pembayaran'],
    'riwayat-kuitansi':['Buku Induk','Arsip & pencatatan seluruh pembayaran santri']};
  const t = titles[id]||[id,id];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSubtitle').textContent = t[1];

  closeSidebar();
  if(id==='dashboard') renderDashboard();
  if(id==='rekap-siswa') renderSiswaTable();
  if(id==='tunggakan') { tunggakanShowAll = false; renderTunggakan(); }
  if(id==='spmb') renderSpmbPage();
  if(id==='pengaturan') renderItemList();
  if(id==='input') renderInputPage();
  if(id==='cetak') renderCetakPage();
  if(id==='template-kuitansi') renderTemplateKuitansiPage();
  if(id==='riwayat-kuitansi') { if(typeof renderBukuIndukPage==='function') renderBukuIndukPage(); loadRiwayatKuitansi(); }
}

// ── Gambar ulang setelah data disinkronkan ──
// Halaman yang TIDAK sedang dibuka tak perlu digambar: showPage() menggambarnya
// lagi begitu dibuka, selalu dari appState terbaru. Dulu setiap sinkron latar
// (tiap 20 detik, tiap tab difokus, dan tiap perubahan dari device lain)
// membangun ulang keempat tampilan sekaligus — tiga di antaranya tak terlihat.
// Di HP kelas menengah itu jeda yang terasa saat mengetik.
function activePageId() {
  const el = document.querySelector('.page.active');
  return el ? el.id.replace(/^page-/, '') : '';
}

function renderHalamanAktif() {
  const id = activePageId();
  if (id === 'dashboard')   renderDashboard();
  if (id === 'rekap-siswa') renderSiswaTable();
  if (id === 'tunggakan')   renderTunggakan();
  if (id === 'cetak')       renderCetakNamaOptions();
}

function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarBackdrop').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarBackdrop').classList.remove('show'); }

// ── Student helpers ──
// ══════════════════════════════════════════
// STUDENT IDENTITY RESOLUTION
// Menghubungkan siswa lintas TA via NISN + fuzzy name matching
// ══════════════════════════════════════════

// Index semua siswa dari semua TA (nama/nisn → array of records)
let studentIndex = {}; // key: canonical_id → { nisn, nama_canonical, records:[] }

// Normalisasi nama: uppercase, trim, collapse spaces
function normNama(nama) {
  return (nama || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// Hitung Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Similarity score 0-1 (1 = identik)
function nameSimilarity(a, b) {
  const na = normNama(a), nb = normNama(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

// Tentukan apakah 2 record siswa adalah orang yang sama
// Prioritas: NISN → nama fuzzy (threshold 0.85)
// Pengecualian: nama sama tapi beda kelas dalam TA yang sama = orang berbeda
function isSameStudent(a, b) {
  // NISN cocok (keduanya tidak kosong) → pasti orang sama
  if (a.nisn && b.nisn && a.nisn.trim() === b.nisn.trim()) return true;

  // Nama identik setelah normalisasi
  if (normNama(a.nama) === normNama(b.nama)) return true;

  // Fuzzy nama (salah satu NISN kosong), threshold 0.85
  if ((!a.nisn || !b.nisn) && nameSimilarity(a.nama, b.nama) >= 0.85) return true;

  return false;
}

// Bangun canonical key untuk siswa
function canonicalKey(s) {
  if (s.nisn) return 'nisn:' + s.nisn.trim();
  return 'nama:' + normNama(s.nama);
}

async function loadAllStudentsIndex() {
  // Tidak diperlukan lagi — semua data ada di appState.students
}

function buildStudentIndex() {
  // Tidak diperlukan lagi
}

// Dapatkan semua transaksi siswa
async function getAllTransactionsByStudent(s) {
  try {
    const rows = await sb('transactions?select=*&nama=eq.' + encodeURIComponent(s.nama) + '&order=created_at.desc');
    return rows;
  } catch(e) { return []; }
}

// Update getStudent agar bisa fuzzy match
function getStudent(nama) {
  // Exact match dulu
  let found = appState.students.find(s => s.nama === nama);
  if (found) return found;
  // Fuzzy fallback
  const norm = normNama(nama);
  return appState.students.find(s => normNama(s.nama) === norm) || null;
}

// Deteksi nama duplikat / mirip di antara siswa TA aktif
function detectDuplicateNames() {
  const students = appState.students;
  const dupes = [];
  for (let i = 0; i < students.length; i++) {
    for (let j = i+1; j < students.length; j++) {
      const a = students[i], b = students[j];
      // Beda kelas dalam TA yang sama = orang berbeda, skip
      if (a.kelas !== b.kelas) continue;
      const sim = nameSimilarity(a.nama, b.nama);
      if (sim >= 0.85 && sim < 1) {
        dupes.push({ a: a.nama, b: b.nama, score: Math.round(sim*100) });
      }
    }
  }
  return dupes;
}

// ══════════════════════════════════════════
// BULAN JATUH TEMPO SPP (TAHUN BERJALAN)
// ══════════════════════════════════════════
// SPP dihitung BERJALAN, bukan sekaligus satu tahun ajaran penuh: yang dianggap
// menunggak hanya bulan yang sudah tiba — dari Juli (awal TA) sampai bulan
// aktif saat ini. Bulan yang belum tiba TIDAK dihitung tunggakan, tapi tetap
// boleh dibayar di muka lewat form Input Pembayaran.
//
// Contoh: TA 2025/2026, hari ini Oktober 2025 dan belum bayar sama sekali →
// tunggakan = 4 bulan (Jul, Agt, Sep, Okt), bukan 12 bulan.

// Tahun awal TA aktif, diambil dari Profil Madrasah ("2025/2026" → 2025).
// Bila profil belum diisi/tidak terbaca, turunkan dari tanggal hari ini
// (tahun ajaran dianggap mulai Juli).
function taStartYear(ref) {
  const d = ref || new Date();
  const label = (typeof getProfil === 'function') ? String(getProfil().ta || '') : '';
  const m = label.match(/(\d{4})/);
  if (m) return parseInt(m[1], 10);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

// Tahun awal dari sebuah label TA ("2025/2026" → 2025); 0 bila tidak terbaca.
function taYearOf(label) {
  const m = String(label || '').match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

// true bila label TA menunjuk tahun ajaran BERJALAN atau sesudahnya.
// Tahun-tahun itu ditangani jalur SPP tahun berjalan (kolom spp_paid_months),
// jadi entri riwayat dengan label tersebut TIDAK boleh ikut dihitung sebagai
// "tunggakan TA sebelumnya" — kalau ikut, tagihannya terhitung dua kali.
function isTaBerjalanAtauSesudah(ta) {
  const y = taYearOf(ta);
  return y > 0 && y >= taStartYear();
}

// Santri LULUS tidak lagi menagih SPP tahun berjalan (sppTunggakan() = 0), jadi
// arsip berlabel TA berjalan miliknya adalah satu-satunya catatan dan tetap
// harus dihitung. Untuk santri aktif, label seperti itu selalu bentrok.
function sppHistBisaBentrok(s) {
  return !s || s.status_kelulusan !== 'lulus';
}

// Label TA yang bentrok di riwayat satu santri (label TA berjalan/sesudahnya).
// Dipakai untuk memberi peringatan agar admin merapikannya lewat editor
// "Tunggakan TA Sebelumnya".
function sppHistTaBentrok(s) {
  const hist = (s && s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
  if (!sppHistBisaBentrok(s)) return [];
  return Object.keys(hist).filter(ta =>
    isTaBerjalanAtauSesudah(ta) && sppHistMonths(hist[ta]).some(x => x.sisa > 0));
}

// Posisi bulan hari ini di dalam TA aktif (Jul=0 … Jun=11).
//   < 0  → TA belum mulai (belum ada bulan yang jatuh tempo)
//   > 11 → TA sudah lewat (seluruh 12 bulan jatuh tempo)
function sppMonthIndex(ref) {
  const d = ref || new Date();
  return (d.getFullYear() - taStartYear(d)) * 12 + (d.getMonth() - 6);
}

// Cache kecil: dipanggil sekali per siswa per render, sedangkan hasilnya hanya
// berubah saat ganti bulan atau saat TA di profil diubah.
let _sppDueCache = { key: '', months: [] };

// Bulan SPP yang sudah jatuh tempo per tanggal `ref` (default: hari ini).
// Bulan berjalan IKUT dihitung — SPP bulan ini sudah menjadi kewajiban.
function sppDueMonths(ref) {
  const d = ref || new Date();
  const key = d.getFullYear() + '-' + d.getMonth() + '|' +
    ((typeof getProfil === 'function') ? String(getProfil().ta || '') : '');
  if (_sppDueCache.key === key) return _sppDueCache.months;
  const idx = sppMonthIndex(d);
  const months = idx < 0 ? [] : idx > 11 ? MONTHS.slice() : MONTHS.slice(0, idx + 1);
  _sppDueCache = { key, months };
  return months;
}

// true bila bulan `m` sudah jatuh tempo pada TA berjalan.
function isSppDue(m, ref) { return sppDueMonths(ref).includes(m); }

// ══════════════════════════════════════════
// BULAN MULAI TAGIH SPP (SANTRI MASUK DI TENGAH TAHUN AJARAN)
// ══════════════════════════════════════════
// Santri baru — mis. calon SPMB yang dipromosikan pada bulan November — TIDAK
// boleh ditagih SPP bulan-bulan sebelum ia masuk. Tanpa penanda ini, santri
// yang baru dimasukkan langsung tampil menunggak Juli s/d Oktober.
//
// Penanda disimpan di kolom students.spp_mulai dengan format "2025/2026|Nov"
// (label TA + kode bulan). Label TA ikut disimpan supaya penanda otomatis
// berhenti berlaku begitu tahun ajaran berganti: mulai TA berikutnya santri
// tersebut sudah ditagih penuh dari Juli seperti santri lain.
const SPP_MULAI_SEP = '|';

// Bentuk nilai kolom spp_mulai; '' bila bulannya tidak dikenal ATAU Juli —
// Juli adalah awal tahun ajaran, jadi sama saja dengan tanpa penanda. Dengan
// begitu isi kolom selalu ringkas: kosong, atau bulan masuk yang sebenarnya.
function buildSppMulai(ta, m) {
  const code = monthCode(m);
  if (!code || code === MONTHS[0]) return '';
  return String(ta || '').trim() + SPP_MULAI_SEP + code;
}

// "2025/2026|Nov" → { ta:'2025/2026', bulan:'Nov' }; null bila kosong/tak terbaca.
// Nilai tanpa label TA ("Nov") tetap diterima dan dianggap milik TA berjalan.
function parseSppMulai(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const parts = raw.split(SPP_MULAI_SEP);
  const bulan = monthCode(parts.length > 1 ? parts[1] : parts[0]);
  if (!bulan) return null;
  return { ta: parts.length > 1 ? parts[0].trim() : '', bulan };
}

// Kode bulan mulai tagih SPP santri pada TA `ta` (default: TA berjalan).
// '' bila santri ditagih penuh dari Juli, atau bila penandanya milik tahun
// ajaran lain.
function sppMulaiBulanTa(s, ta) {
  const info = parseSppMulai(s && s.spp_mulai);
  if (!info) return '';
  const yPenanda = taYearOf(info.ta);
  const yTarget  = ta === undefined ? taStartYear() : taYearOf(ta);
  // Penanda tanpa label TA dianggap milik TA yang sedang diperiksa.
  if (yPenanda && yTarget && yPenanda !== yTarget) return '';
  return info.bulan;
}

function sppMulaiBulan(s) { return sppMulaiBulanTa(s); }

// Posisi bulan mulai di dalam MONTHS (0 = Juli / tanpa penanda).
function sppMulaiIndexTa(s, ta) {
  const i = MONTHS.indexOf(sppMulaiBulanTa(s, ta));
  return i > 0 ? i : 0;
}
function sppMulaiIndex(s) { return sppMulaiIndexTa(s); }

// Bulan yang memang ditagih ke santri ini pada TA berjalan — seluruh 12 bulan
// untuk santri lama, atau sejak bulan masuk untuk santri baru.
function sppBillableMonths(s) { return MONTHS.slice(sppMulaiIndex(s)); }

// Bulan jatuh tempo milik satu santri: bulan jatuh tempo TA berjalan yang juga
// sudah menjadi kewajibannya (bulan sebelum ia masuk dilewati).
function sppDueMonthsFor(s, ref) { return sppDueMonths(ref).slice(sppMulaiIndex(s)); }

// true bila bulan `m` sudah jatuh tempo DAN sudah menjadi kewajiban santri ini.
function isSppDueFor(s, m, ref) { return sppDueMonthsFor(s, ref).includes(m); }

// true bila bulan `m` jatuh sebelum santri masuk — tidak pernah ditagih.
function isSppSebelumMasuk(s, m) { return MONTHS.indexOf(m) < sppMulaiIndex(s); }

// Nama bulan mulai tagih ("November"); '' bila ditagih penuh dari Juli.
function sppMulaiLabel(s) {
  const i = sppMulaiIndex(s);
  return i > 0 ? (MONTH_FULL[MONTHS[i]] || MONTHS[i]) : '';
}

// Kode bulan kalender hari ini dalam penanggalan TA ("Nov" bila kini November).
function bulanBerjalanCode(ref) {
  const d = ref || new Date();
  return monthCode(String(d.getMonth() + 1));
}

// <option> daftar bulan untuk pemilih "SPP mulai bulan" (nilai '' = dari Juli).
function sppMulaiOptionsHtml(selected) {
  const sel = monthCode(selected);
  return '<option value="">Juli — awal tahun ajaran (penuh 12 bulan)</option>' +
    MONTHS.map(m =>`<option value="${m}"${m === sel ? ' selected' : ''}>${MONTH_FULL[m]}</option>`).join('');
}

// Peringatan di dekat pemilih "SPP mulai bulan": tanpa kolom penandanya di
// database, pilihan admin tidak akan bertahan — dan dulu itu tidak terlihat di
// mana pun, sehingga bulan yang dipilih saat promosi SPMB seolah "hilang
// sendiri" begitu santrinya dibuka di Input Pembayaran.
function renderSppMulaiWarn(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const ada = (typeof sppMulaiKolomAda !== 'function') || sppMulaiKolomAda();
  el.style.display = ada ? 'none' : 'block';
  el.innerHTML = ada ? '' : `
    <div class="bg-danger-pale rounded-8 p-8-10 mt-6 fs-12 lh-15 text-danger">
      <svg class="ic"><use href="#i-alert"/></svg> ${esc(typeof SPP_MULAI_MIGRASI_MSG === 'string' ? SPP_MULAI_MIGRASI_MSG : '')}
    </div>`;
}

// Segarkan semua peringatan itu sekaligus — dipanggil saat status kolomnya
// berubah (mis. ketahuan hilang saat menyimpan).
function syncSppMulaiWarnBanners() {
  ['promosiCalonMulaiWarn', 'promosiMassalMulaiWarn', 'edSppMulaiWarn'].forEach(renderSppMulaiWarn);
}

// Nama bulan terakhir yang jatuh tempo — untuk keterangan "dihitung s/d …".
function sppDueMonthLabel(ref) {
  const due = sppDueMonths(ref);
  if (!due.length) return '';
  return MONTH_FULL[due[due.length - 1]] || due[due.length - 1];
}

// Bulan jatuh tempo yang belum dibayar — dasar perhitungan tunggakan SPP
// tahun berjalan (dipakai juga untuk menampilkan rincian bulannya).
function sppUnpaidDueMonths(s, ref) {
  if (!s || s.status_kelulusan === 'lulus') return [];
  const paid = s.spp_paid_months || [];
  return sppDueMonthsFor(s, ref).filter(m => !paid.includes(m));
}

// Bulan yang belum jatuh tempo & belum dibayar — bukan tunggakan, tapi tetap
// bisa dipilih di form Input Pembayaran sebagai pembayaran di muka.
function sppUpcomingMonths(s, ref) {
  if (!s || s.status_kelulusan === 'lulus') return [];
  const paid = s.spp_paid_months || [];
  const due = sppDueMonths(ref);
  return sppBillableMonths(s).filter(m => !due.includes(m) && !paid.includes(m));
}

// ── Angsuran SPP tahun berjalan (kolom students.spp_angsur) ──
// Bulan yang baru dibayar SEBAGIAN dicatat di s.spp_angsur = { Agt: 50000 }.
// Bulan itu tetap BELUM lunas (tidak masuk spp_paid_months), jadi tetap muncul
// sebagai tunggakan — hanya saja nominal tunggakannya tinggal sisanya.

// Nominal yang sudah dibayar untuk bulan `m` tahun berjalan.
function sppBulanDibayar(s, m) {
  if (!s) return 0;
  const rate = Number(s.spp) || 0;
  if ((s.spp_paid_months || []).includes(m)) return rate;
  const a = (s.spp_angsur && typeof s.spp_angsur === 'object') ? Number(s.spp_angsur[m]) || 0 : 0;
  return Math.max(0, Math.min(rate, a));
}

// Sisa yang masih harus dibayar untuk bulan `m` tahun berjalan.
function sppBulanSisa(s, m) {
  return Math.max(0, (Number(s && s.spp) || 0) - sppBulanDibayar(s, m));
}

// Ubah nominal terbayar bulan `m` tahun berjalan sebesar `delta` (boleh negatif;
// Infinity = lunasi). Bila mencapai nominal SPP → bulan pindah ke
// spp_paid_months; bila turun di bawahnya → keluar dari daftar lunas dan
// sisanya dicatat sebagai angsuran.
function applySppCurDelta(obj, m, delta) {
  if (!obj || !m) return;
  if (!Array.isArray(obj.spp_paid_months)) obj.spp_paid_months = [];
  if (!obj.spp_angsur || typeof obj.spp_angsur !== 'object' || Array.isArray(obj.spp_angsur)) obj.spp_angsur = {};
  const rate = Number(obj.spp) || 0;
  const now  = sppBulanDibayar(obj, m);
  const next = delta === Infinity ? rate : Math.max(0, now + (Number(delta) || 0));
  if (rate <= 0 ? delta > 0 : next >= rate) {
    if (!obj.spp_paid_months.includes(m)) obj.spp_paid_months.push(m);
    delete obj.spp_angsur[m];
  } else {
    obj.spp_paid_months = obj.spp_paid_months.filter(x => x !== m);
    if (next > 0) obj.spp_angsur[m] = next; else delete obj.spp_angsur[m];
  }
}

// Batalkan bulan lunas `m` (perilaku lama hapus/koreksi kuitansi): bulan keluar
// dari spp_paid_months. Angsuran bulan itu (bila ada) tidak disentuh.
function applySppCurRemove(obj, m) {
  if (!obj || !Array.isArray(obj.spp_paid_months)) return;
  obj.spp_paid_months = obj.spp_paid_months.filter(x => x !== m);
}

// Total angsuran (dibayar sebagian) pada bulan-bulan tahun berjalan yang masih
// ditagih — dikurangkan dari tunggakan.
function sppAngsurTotal(s, months) {
  return (months || []).reduce((a, m) => a + sppBulanDibayar(s, m), 0);
}

function sppTunggakan(s) {
  // Lulusan tidak punya kewajiban SPP tahun berjalan — SPP-nya sudah diarsipkan
  // ke spp_history (dihitung sebagai tunggakan tahun lalu). Tanpa ini, bulan
  // yang direset saat lulus akan tampil sebagai 12 bulan "belum bayar" palsu.
  if (s.status_kelulusan === 'lulus') return 0;
  if (!s.spp || s.spp === 0) return 0;
  return sppUnpaidDueMonths(s).reduce((a, m) => a + sppBulanSisa(s, m), 0);
}

// Arsipkan SPP tahun berjalan ke riwayat (spp_history) SEBELUM spp_paid_months
// direset, agar bulan yang belum dibayar tetap tercatat sebagai tunggakan tahun
// lalu & bisa dibayar di tahun ajaran baru. Dipakai saat promosi kelas dan saat
// menandai santri LULUS. Disimpan sekali per label TA (tidak menimpa snapshot).
function snapshotSppTahunBerjalan(s, ta) {
  if (!ta || !((s.spp || 0) > 0)) return;
  s.spp_history = (s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
  if (s.spp_history[ta]) return;
  const rate = s.spp || 0;
  const paid = [...(s.spp_paid_months || [])];
  const rec = { spp: rate, spp_paid_months: paid };
  // Santri yang masuk di tengah TA ini hanya ditagih sejak bulan masuknya —
  // arsipnya harus memakai bentuk rinci (`months`) supaya bulan sebelum ia
  // masuk tidak ikut jadi tunggakan tahun lalu.
  // Begitu pula bila ada bulan yang baru diangsur: sisa angsurannya harus
  // terbawa sebagai tunggakan tahun lalu, bukan hilang atau dianggap lunas.
  const mulai = sppMulaiIndexTa(s, ta);
  const angsur = (s.spp_angsur && typeof s.spp_angsur === 'object') ? s.spp_angsur : {};
  const adaAngsur = Object.keys(angsur).some(m => MONTHS.includes(m) && Number(angsur[m]) > 0);
  if (mulai > 0 || adaAngsur) {
    rec.months = {};
    MONTHS.slice(Math.max(0, mulai)).forEach(m => {
      rec.months[m] = { n: rate, d: paid.includes(m) ? rate : Math.min(rate, Math.max(0, Number(angsur[m]) || 0)) };
    });
  }
  s.spp_history[ta] = rec;
}

// ══════════════════════════════════════════
// INDEKS TAGIHAN — mempercepat penggambaran tabel
// ══════════════════════════════════════════
// Tagihan disimpan sebagai satu array datar (appState.tagihan). Mencari tagihan
// milik seorang santri berarti memindai SELURUH array. Di halaman Dashboard,
// Data Santri, dan Tunggakan pencarian itu diulang untuk setiap santri — jadi
// biayanya (jumlah santri x jumlah baris tagihan). Untuk 400 santri dengan 2500
// baris tagihan itu sejuta perbandingan, dan totalTunggakan() dipanggil
// beberapa kali per santri dalam satu penggambaran.
//
// withTagihanIndex(fn) menyalakan dua singgahan selama fn berjalan:
//   • byNama — Map nama -> daftar tagihannya, dibangun sekali (satu lintasan).
//   • total  — hasil totalTunggakan() per objek santri, supaya panggilan
//              berulang untuk santri yang sama tidak dihitung ulang.
//
// Singgahan HANYA hidup selama fn dan fn selalu berupa fungsi penggambar yang
// membaca saja — jadi tidak mungkin menyajikan data basi. Di luar fn, semua
// pemanggilan kembali memindai array seperti semula.
let _tkIndex = null;
const _TK_KOSONG = [];

function withTagihanIndex(fn) {
  const luar = _tkIndex;                 // dukung pemanggilan bersarang
  if (!luar) _tkIndex = { byNama: null, total: new WeakMap() };
  try { return fn(); }
  finally { if (!luar) _tkIndex = null; }
}

// Daftar tagihan milik satu santri.
function tagihanOf(nama) {
  if (!_tkIndex) return appState.tagihan.filter(t => t.nama === nama);
  if (!_tkIndex.byNama) {
    const m = new Map();
    appState.tagihan.forEach(t => {
      const arr = m.get(t.nama);
      if (arr) arr.push(t); else m.set(t.nama, [t]);
    });
    _tkIndex.byNama = m;
  }
  return _tkIndex.byNama.get(nama) || _TK_KOSONG;
}

// Tunggakan dari tabel tagihan (semua item tetap)
function itemsTunggakan(s) {
  return tagihanOf(s.nama)
    .reduce((sum, t) => sum + Math.max(0, t.nominal - t.paid_amount), 0);
}

// ── Tunggakan SPP tahun ajaran sebelumnya ──
// Sumber data: s.spp_history = { "2024/2025": { … }, ... }
// Snapshot dibuat saat promosi kelas (pindah TA) sebelum spp_paid_months tahun
// berjalan direset, atau diisi lewat menu "Import Tunggakan" dari data lama —
// jadi bulan yang belum dibayar di tahun-tahun sebelumnya tetap terhitung dan
// bisa dibayar di tahun ajaran berjalan.
//
// Dua bentuk entri didukung:
//   Ringkas (lama)  : { spp: 500000, spp_paid_months: ['Jul','Agt'] }
//                     → semua bulan bernominal sama.
//   Rinci  (baru)   : { spp, spp_paid_months, kelas, months: { Jul:{n,d}, … } }
//                     → n = nominal tagihan bulan itu, d = sudah dibayar.
//                     Dipakai bila nominal SPP berubah di tengah tahun atau ada
//                     pembayaran sebagian. Bulan yang tidak ada di `months`
//                     dianggap tidak ditagih pada TA tersebut.
//
// sppHistMonths(): normalisasi satu entri jadi [{ m, nominal, dibayar, sisa }].
function sppHistMonths(rec) {
  const out = [];
  if (!rec || typeof rec !== 'object') return out;
  const rich = (rec.months && typeof rec.months === 'object' && !Array.isArray(rec.months)) ? rec.months : null;
  const rate = Number(rec.spp) || 0;
  const paid = Array.isArray(rec.spp_paid_months) ? rec.spp_paid_months : [];
  MONTHS.forEach(m => {
    if (rich) {
      const r = rich[m];
      if (!r) return; // bulan tidak ditagih pada TA ini
      const nominal = Math.max(0, Number(r.n) || 0);
      const dibayar = Math.min(nominal, Math.max(0, Number(r.d) || 0));
      out.push({ m, nominal, dibayar, sisa: nominal - dibayar });
    } else {
      if (rate <= 0) return;
      const lunas = paid.includes(m);
      out.push({ m, nominal: rate, dibayar: lunas ? rate : 0, sisa: lunas ? 0 : rate });
    }
  });
  return out;
}

// Daftar tunggakan per tahun ajaran:
//   { ta, kelas, rate, unpaid:['Jul',…], detail:[{m,nominal,dibayar,sisa}], amount,
//     bulanTagih, bulanLunas, tagihan, dibayar }
// `unpaid`/`detail` hanya memuat bulan yang MASIH menunggak (dipakai form input &
// halaman detail), sedangkan `tagihan`/`dibayar`/`bulanTagih` memuat gambaran
// penuh TA tersebut — dibutuhkan surat tagihan agar kolom Tagihan/Terbayar/Sisa
// tiap tahun bisa ditampilkan utuh.
// `unpaid` tetap array kode bulan agar pemakaian lama (y.unpaid.length) tetap jalan.
function sppTunggakanPrevList(s) {
  const hist = (s && s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
  const bentrokMungkin = sppHistBisaBentrok(s);
  const out = [];
  Object.keys(hist).forEach(ta => {
    // Lewati entri berlabel TA BERJALAN (atau sesudahnya). Entri seperti ini
    // bisa muncul bila TA di Profil sudah terlanjur dimajukan sebelum promosi
    // kelas dijalankan, sehingga arsip SPP tahun berjalan tersimpan dengan
    // label tahun yang baru. Bila ikut dihitung, satu tahun ajaran yang sama
    // tampil dua kali: sekali sebagai SPP tahun berjalan, sekali lagi sebagai
    // "tunggakan TA sebelumnya" — totalnya jadi ganda.
    if (bentrokMungkin && isTaBerjalanAtauSesudah(ta)) return;
    const rec = hist[ta] || {};
    const semua = sppHistMonths(rec);
    const belum = semua.filter(x => x.sisa > 0);
    if (!belum.length) return;
    const amount = belum.reduce((a, x) => a + x.sisa, 0);
    out.push({
      ta,
      kelas: rec.kelas || '',
      rate: Number(rec.spp) || Math.round(amount / belum.length),
      unpaid: belum.map(x => x.m),
      detail: belum,
      amount,
      bulanTagih: semua.length,
      bulanLunas: semua.length - belum.length,
      tagihan: semua.reduce((a, x) => a + x.nominal, 0),
      dibayar: semua.reduce((a, x) => a + x.dibayar, 0),
    });
  });
  // Urutkan menaik berdasar tahun awal TA (yang paling lama tampil dulu)
  out.sort((a, b) => (parseInt(a.ta) || 0) - (parseInt(b.ta) || 0));
  return out;
}

// Ubah nominal terbayar satu bulan tunggakan TA lalu sebesar `delta` (boleh
// negatif). Entri ringkas diubah ke bentuk rinci hanya bila perlu mencatat
// pembayaran sebagian, supaya data lama tetap seringkas mungkin.
function applySppHistDelta(stu, ta, m, delta, rate) {
  if (!stu || !ta || !m) return;
  stu.spp_history = (stu.spp_history && typeof stu.spp_history === 'object' && !Array.isArray(stu.spp_history))
    ? stu.spp_history : {};
  const rec = stu.spp_history[ta] || (stu.spp_history[ta] = { spp: Number(rate) || 0, spp_paid_months: [] });
  if (!Array.isArray(rec.spp_paid_months)) rec.spp_paid_months = [];
  const info = sppHistMonths(rec).find(x => x.m === m)
    || { m, nominal: Number(rate) || Number(rec.spp) || 0, dibayar: 0 };
  const n = info.nominal;
  const d = Math.min(n, Math.max(0, info.dibayar + (Number(delta) || 0)));
  const rich = rec.months && typeof rec.months === 'object' && !Array.isArray(rec.months);
  if (!rich && (d === 0 || d >= n) && n === (Number(rec.spp) || 0)) {
    // Bentuk ringkas cukup: bulan lunas penuh atau belum dibayar sama sekali.
    if (d >= n) { if (!rec.spp_paid_months.includes(m)) rec.spp_paid_months.push(m); }
    else rec.spp_paid_months = rec.spp_paid_months.filter(x => x !== m);
    return;
  }
  if (!rich) {
    rec.months = {};
    sppHistMonths({ spp: rec.spp, spp_paid_months: rec.spp_paid_months })
      .forEach(x => { rec.months[x.m] = { n: x.nominal, d: x.dibayar }; });
  }
  rec.months[m] = { n, d };
  if (d >= n) { if (!rec.spp_paid_months.includes(m)) rec.spp_paid_months.push(m); }
  else rec.spp_paid_months = rec.spp_paid_months.filter(x => x !== m);
}

// TA lama yang dibayar sebuah item kuitansi SPP ('' = SPP tahun berjalan).
// Item baru membawa field `ta`; item lama dikenali dari namanya
// ("SPP Tunggakan TA 2024/2025").
function sppItemTa(item) {
  if (!item) return '';
  if (item.ta) return String(item.ta);
  const m = String(item.name || '').match(/Tunggakan\s+TA\s+([0-9]{4}\s*\/\s*[0-9]{4})/i);
  return m ? m[1].replace(/\s+/g, '') : '';
}

// Operasi commitSppOps() untuk MEMBATALKAN (sign=-1) atau MENGEMBALIKAN
// (sign=+1) efek satu item kuitansi SPP berbulan. null bila bukan item SPP.
//   • tunggakan TA lama      → selisih nominal di spp_history
//   • angsuran tahun berjalan → selisih nominal (bisa membuat bulan lunas jadi
//                              belum lunas lagi, atau sebaliknya)
//   • bulan lunas biasa      → tandai/batalkan bulannya (perilaku lama)
function sppRevertOp(item, sign) {
  if (!item || !item.bulan) return null;
  if (sppItemTa(item) || item.angsur) return sppDeltaOp(item, (Number(item.amount) || 0) * sign);
  return { cur: sign < 0 ? { m: item.bulan, remove: true } : { m: item.bulan, add: true } };
}

// Operasi commitSppOps() yang menambah/mengurangi nominal bulan sebuah item
// kuitansi SPP sebesar `delta` (tahun berjalan atau tunggakan TA lama).
function sppDeltaOp(item, delta) {
  const ta = sppItemTa(item);
  return ta ? { hist: { ta, m: item.bulan, delta, rate: item.rate } } : { cur: { m: item.bulan, delta } };
}

// Total nominal tunggakan SPP dari seluruh tahun ajaran sebelumnya.
function sppTunggakanPrev(s) {
  return sppTunggakanPrevList(s).reduce((sum, y) => sum + y.amount, 0);
}

function totalTunggakan(s) {
  // Di dalam withTagihanIndex(), hasil per santri disinggahkan: satu
  // penggambaran tabel memanggil fungsi ini berkali-kali untuk santri yang sama
  // (menyaring, menjumlah, lalu mengisi kolom).
  if (_tkIndex && s && typeof s === 'object') {
    const memo = _tkIndex.total.get(s);
    if (memo !== undefined) return memo;
    const v = sppTunggakan(s) + sppTunggakanPrev(s) + itemsTunggakan(s);
    _tkIndex.total.set(s, v);
    return v;
  }
  return sppTunggakan(s) + sppTunggakanPrev(s) + itemsTunggakan(s);
}

// ── Tunggakan calon santri (SPMB) ──
// Calon santri masih memakai field uang_pendaftaran/pangkal + *_paid,
// bukan tabel tagihan (yang dipakai santri aktif setelah promosi).
function pendaftaranTunggakan(s) {
  const t = (typeof findTagihan === 'function') ? findTagihan(s.nama, 'pendaftaran') : null;
  if (t) return Math.max(0, (t.nominal || 0) - (t.paid_amount || 0));
  return Math.max(0, (s.uang_pendaftaran || 0) - (s.uang_pendaftaran_paid || 0));
}

// Pangkal kini disimpan sebagai tagihan (per-siswa, persisten & terbawa saat
// promosi). Utamakan tagihan; fallback ke field lama bila tagihan belum ada.
function pangkalTunggakan(s) {
  const t = (typeof findTagihan === 'function') ? findTagihan(s.nama, 'pangkal') : null;
  if (t) return Math.max(0, (t.nominal || 0) - (t.paid_amount || 0));
  return Math.max(0, (s.pangkal || 0) - (s.pangkal_paid || 0));
}


// ── DASHBOARD ──
;// ══ js/dashboard.js ══
// ── SiPay · Dashboard Page ──
function renderDashboard() {
  return withTagihanIndex(_renderDashboard);
}
function _renderDashboard() {
  const all = appState.students;
  // ss = santri AKTIF. Tabel students juga menyimpan alumni, santri pindah/
  // keluar, dan calon santri SPMB — semuanya TIDAK boleh ikut dihitung sebagai
  // "Santri Aktif" atau tunggakan berjalan.
  const ss = all.filter(isSantriAktif);
  const nonAktif = all.length - ss.length;
  // Satu lintasan untuk seluruh rincian status (dulu satu filter penuh per status).
  const jmlStatus = {};
  all.forEach(s => { const k = s.status_kelulusan || ''; jmlStatus[k] = (jmlStatus[k] || 0) + 1; });
  const rincianNonAktif = Object.entries(STATUS_NON_AKTIF)
    .map(([k, label]) => ({ label, n: jmlStatus[k] || 0 }))
    .filter(x => x.n);

  // Uang yang benar-benar masuk — dihitung dari SEMUA santri, termasuk yang
  // sudah tidak aktif, karena pembayaran mereka tetap pemasukan yang nyata.
  const totalBayarSPP = all.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length + sppAngsurTotal(s, MONTHS), 0);
  const totalBayarTagihan = appState.tagihan.reduce((a,t) => a + (t.paid_amount||0), 0);

  // Tunggakan berjalan = santri aktif saja. Tunggakan santri non-aktif tetap
  // ditampilkan terpisah supaya tidak hilang dari pandangan.
  const totalTunggak = ss.reduce((a,s) => a + totalTunggakan(s), 0);
  const belumLunas   = ss.filter(s => totalTunggakan(s) > 0).length;
  const tunggakNonAktif = all.reduce((a,s) => isSantriAktif(s) ? a : a + totalTunggakan(s), 0);

  const subSantri = nonAktif
    ? `Santri Aktif &nbsp;·&nbsp; +${nonAktif} non-aktif`
    : 'Santri Aktif';
  const judulSantri = nonAktif
    ? `${all.length} baris di database: ${ss.length} aktif, ` +
      rincianNonAktif.map(x => `${x.n} ${x.label}`).join(', ')
    : `${all.length} santri aktif`;

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card green" title="${esc(judulSantri)}"><div class="stat-label">Total Santri</div><div class="stat-value">${ss.length}</div><div class="stat-sub">${subSantri}</div><div class="stat-icon"><svg class="ic"><use href="#i-grad"/></svg></div></div>
    <div class="stat-card gold"><div class="stat-label">Total Terkumpul</div><div class="stat-value fs-18">${rp(totalBayarSPP+totalBayarTagihan)}</div><div class="stat-sub">SPP + Semua Pembayaran</div><div class="stat-icon"><svg class="ic"><use href="#i-cash"/></svg></div></div>
    <div class="stat-card red"><div class="stat-label">Total Tunggakan</div><div class="stat-value fs-18">${rp(totalTunggak)}</div><div class="stat-sub">${belumLunas} dari ${ss.length} santri aktif belum lunas${tunggakNonAktif > 0 ? ` &nbsp;·&nbsp; ${rp(tunggakNonAktif)} non-aktif` : ''}</div><div class="stat-icon"><svg class="ic"><use href="#i-alert"/></svg></div></div>
    <div class="stat-card blue"><div class="stat-label">Santri Lunas</div><div class="stat-value">${ss.length - belumLunas}</div><div class="stat-sub">dari ${ss.length} santri aktif tanpa tunggakan</div><div class="stat-icon"><svg class="ic"><use href="#i-check"/></svg></div></div>
  `;

  // Kelas table
  // Kelompokkan sekali (dulu: satu penyaringan penuh untuk tiap kelas).
  const perKelas = new Map();
  ss.forEach(s => {
    const arr = perKelas.get(s.kelas);
    if (arr) arr.push(s); else perKelas.set(s.kelas, [s]);
  });
  const kelasList = [...perKelas.keys()].sort();
  const tbody = document.querySelector('#dashKelasTable tbody');
  tbody.innerHTML = kelasList.map(k => {
    const ks = perKelas.get(k);
    // "Lunas" = tidak ada tunggakan s/d bulan berjalan (bulan yang belum tiba
    // tidak membuat santri dianggap menunggak).
    const lunas = ks.filter(s => !s.spp || sppUnpaidDueMonths(s).length === 0).length;
    const tkItems = ks.reduce((a,s)=>a+itemsTunggakan(s),0);
    const pct_ = pct(lunas,ks.length);
    return `<tr>
      <td><strong>${k==='?'?'Kelas Belum Diset':esc(k)}</strong></td>
      <td>${ks.length}</td>
      <td>${lunas} / ${ks.length} <span class="hint">(${pct_}%)</span></td>
      <td>${rp(tkItems)}</td>
      <td>${pct_===100?'<span class="badge badge-green">✓ Lunas</span>':pct_>50?'<span class="badge badge-yellow">~Sebagian</span>':'<span class="badge badge-red">Banyak Tunggak</span>'}</td>
    </tr>`;
  }).join('');

  // Month summary
  const ms = document.getElementById('monthSummary');
  // Santri yang baru masuk di tengah TA belum ditagih bulan-bulan sebelumnya,
  // jadi ia tidak ikut jadi penyebut di bulan-bulan itu. Dihitung dalam satu
  // lintasan santri — dulu tiap bulan menyaring ulang seluruh daftar (2x12 kali).
  const rekapBulan = MONTHS.map(() => ({ ditagih: 0, paid: 0 }));
  ss.forEach(s => {
    if (!(s.spp > 0)) return;
    const paidMonths = s.spp_paid_months || [];
    for (let i = sppMulaiIndex(s); i < MONTHS.length; i++) {
      rekapBulan[i].ditagih++;
      if (paidMonths.includes(MONTHS[i])) rekapBulan[i].paid++;
    }
  });
  ms.innerHTML = MONTHS.map((m, mi) => {
    const paid  = rekapBulan[mi].paid;
    const total = rekapBulan[mi].ditagih;
    const p = pct(paid,total);
    // Bulan yang belum jatuh tempo ditandai netral — capaian rendah di situ
    // wajar (belum ditagih), jadi jangan diberi warna "merah".
    const due = isSppDue(m);
    return `<div class="mb-10${due?'':' is-dim'}">
      <div class="flex justify-between fs-12 mb-3">
        <span class="fw-600">${MONTH_FULL[m]}${due?'':' <span class="fw-400 fs-12 text-muted">(belum jatuh tempo)</span>'}</span><span class="text-muted">${paid}/${total}</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar ${!due?'yellow':p>80?'green':p>40?'yellow':'red'}" style="width:${p}%"></div></div>
    </div>`;
  }).join('');

  // Tunggakan terbesar — santri aktif, 5 teratas, langsung bisa dibayar
  const top = ss.map(s => ({ s, tk: totalTunggakan(s) })).filter(x => x.tk > 0)
    .sort((a, b) => b.tk - a.tk).slice(0, 5);
  document.querySelector('#dashTopTunggak tbody').innerHTML = top.length
    ? top.map(({ s, tk }) => `<tr>
        <td><strong>${esc(s.nama)}</strong></td><td>${esc(kelasLabel(s))}</td>
        <td class="text-right text-danger fw-700">${rp(tk)}</td>
        <td class="text-right"><button class="btn btn-primary btn-sm" onclick="quickInput('${escJs(s.nama)}')"><svg class="ic"><use href="#i-card"/></svg> Bayar</button></td>
      </tr>`).join('')
    : '<tr><td class="empty-row" colspan="4"><svg class="ic"><use href="#i-check"/></svg> Tidak ada tunggakan</td></tr>';

  // Recent transactions
  const tbody2 = document.querySelector('#recentTable tbody');
  const recent = appState.transactions.slice(-6).reverse();
  if (!recent.length) {
    tbody2.innerHTML = '<tr><td class="empty-row" colspan="4">Belum ada transaksi tercatat</td></tr>';
  } else {
    tbody2.innerHTML = recent.map(t => `<tr>
      <td class="hint">${esc(t.time)}</td>
      <td><strong>${esc(t.nama)}</strong></td>
      <td>${esc(t.jenis)}</td><td class="text-right">${rp(t.nominal)}</td>
    </tr>`).join('');
  }
}

// ── INPUT PAGE ──
;// ══ js/input.js ══
// ── SiPay · Input Pembayaran ──
let inputNamaSuggIdx = -1;
// Daftar tunggakan SPP tahun ajaran sebelumnya untuk siswa terpilih (dari
// spp_history). Diisi ulang tiap kali renderPaymentItems dipanggil dengan siswa.
let inputPrevArrears = [];

function renderInputPage() {
  // Reset search field saat halaman dibuka
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('inputNama').value = '';
  const chk = document.getElementById('inputShowNonAktif');
  if (chk) chk.checked = false;
  hideInputNamaDropdown();
  resetPaymentMeta();
  clearCart();
  renderPaymentItems();
}

// ── Metadata pembayaran: tanggal & jam, metode, dibayar oleh ──
function _todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _nowHM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function resetPaymentMeta() {
  const jam = document.getElementById('inputJam');
  if (jam) jam.value = _nowHM();
  setTglMode('today');   // juga mengisi tanggal = hari ini
  setMetode('tunai');
  const oleh = document.getElementById('inputDibayarOleh');
  if (oleh) oleh.value = '';
}

// Mode tanggal: 'today' (kunci ke hari ini) atau 'other' (bisa pilih tanggal lain).
function setTglMode(mode) {
  const todayBtn = document.getElementById('tglTodayBtn');
  const otherBtn = document.getElementById('tglOtherBtn');
  const tgl = document.getElementById('inputTanggal');
  if (todayBtn) todayBtn.classList.toggle('active', mode === 'today');
  if (otherBtn) otherBtn.classList.toggle('active', mode === 'other');
  if (tgl) {
    if (mode === 'today') { tgl.value = _todayISO(); tgl.disabled = true; }
    else { tgl.disabled = false; }
  }
}

// Bila admin mengubah tanggal ke selain hari ini, otomatis pindah ke mode 'other'.
function onInputTanggalChange() {
  const tgl = document.getElementById('inputTanggal');
  if (tgl && tgl.value && tgl.value !== _todayISO()) setTglMode('other');
}

function setMetode(m) {
  const hid = document.getElementById('inputMetode');
  if (hid) hid.value = m;
  const bt = document.getElementById('metodeTunaiBtn');
  const btr = document.getElementById('metodeTransferBtn');
  if (bt)  bt.classList.toggle('active', m === 'tunai');
  if (btr) btr.classList.toggle('active', m === 'transfer');
  const lbl = document.getElementById('dibayarOlehLabel');
  const inp = document.getElementById('inputDibayarOleh');
  if (m === 'transfer') {
    if (lbl) lbl.innerHTML = 'Dibayar oleh <span class="text-muted fw-400">(pengirim transfer)</span>';
    if (inp) inp.placeholder = 'Nama pengirim transfer...';
  } else {
    if (lbl) lbl.innerHTML = 'Dibayar oleh <span class="text-muted fw-400">(opsional)</span>';
    if (inp) inp.placeholder = 'Nama pembayar / penyetor...';
  }
}

// Rangkai string tampilan "DD/MM/YYYY HH:MM" dari input tanggal & jam.
function buildInputTimeStr() {
  const dVal = document.getElementById('inputTanggal')?.value; // YYYY-MM-DD
  const jVal = document.getElementById('inputJam')?.value;     // HH:MM
  const now = new Date();
  let dateObj = now;
  if (dVal) { const p = dVal.split('-').map(Number); dateObj = new Date(p[0], p[1]-1, p[2]); }
  const tglStr = dateObj.toLocaleDateString('id-ID');
  const jamStr = jVal || now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  return tglStr + ' ' + jamStr;
}

function getPaymentMeta() {
  return {
    metode: document.getElementById('inputMetode')?.value || 'tunai',
    dibayar_oleh: (document.getElementById('inputDibayarOleh')?.value || '').trim(),
  };
}

function onInputNamaSearch() {
  inputNamaSuggIdx = -1;
  const q = (document.getElementById('inputNamaSearch').value || '').toLowerCase().trim();
  const dd = document.getElementById('inputNamaDropdown');
  if (!dd) return;

  // Default: santri aktif + calon SPMB; centang toggle untuk tampilkan semua
  const showNonAktif = document.getElementById('inputShowNonAktif')?.checked;
  const isNonAktif = s => !!(s.status_kelulusan && s.status_kelulusan !== 'calon'); // lulus/pindah/keluar
  const base = showNonAktif
    ? appState.students
    : appState.students.filter(s => !isNonAktif(s));

  // Bila toggle dicentang tapi memang tak ada satu pun santri non-aktif,
  // jelaskan penyebabnya (bukan sekadar "tidak ditemukan").
  if (showNonAktif && !appState.students.some(isNonAktif)) {
    dd.innerHTML = `<div class="p-14-16 fs-12-5 text-muted lh-155">
      Belum ada santri berstatus <strong>lulus / pindah / keluar</strong>.<br>
      Tandai dulu lewat menu <strong>Data Santri</strong> (pilih santri → ubah status)
      atau <strong>Promosi Kelas</strong>, lalu mereka akan muncul di sini.
    </div>`;
    dd.style.display = 'block';
    return;
  }

  let list = q
    ? base.filter(s =>
        s.nama.toLowerCase().includes(q) ||
        (s.nisn && s.nisn.includes(q)) ||
        s.kelas.includes(q)
      )
    : base;

  // Saat toggle non-aktif aktif, tampilkan santri non-aktif lebih dulu agar
  // langsung terlihat (tidak tenggelam di bawah daftar santri aktif / batas 15).
  if (showNonAktif) {
    list = [...list].sort((a, b) => (isNonAktif(b) ? 1 : 0) - (isNonAktif(a) ? 1 : 0));
  }

  if (!list.length) {
    dd.innerHTML = `<div class="p-14-16 fs-13 text-muted">Tidak ditemukan</div>`;
    dd.style.display = 'block';
    return;
  }

  const tunggakBadge = s => {
    const tk = totalTunggakan(s);
    return tk > 0
      ? `<span class="fs-12 fw-700 text-danger bg-danger-pale p-2-8 rounded-20"><svg class="ic"><use href="#i-alert"/></svg> ${rp(tk)}</span>`
      : `<span class="fs-12 fw-700 text-primary-light bg-primary-pale p-2-8 rounded-20">✓ Lunas</span>`;
  };

  // Highlight karakter yang cocok (tiap potongan di-escape agar aman dari XSS)
  const highlight = (text, q) => {
    if (!q) return esc(text);
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) +
      `<mark class="hl">${esc(text.slice(idx, idx+q.length))}</mark>` +
      esc(text.slice(idx + q.length));
  };

  dd.innerHTML = list.slice(0, 15).map((s, i) => `
    <div class="input-nama-item sugg-row" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectInputNama('${escJs(s.nama)}')"
      onmouseenter="hoverInputNamaItem(${i})"
     >
      <div>
        <div class="fw-600 fs-13-5">${highlight(s.nama, q)}${isNonAktif(s) ? ` <span class="fs-12 fw-700 text-accent bg-accent-pale rounded-5 p-1-6 align-middle">${esc(kelasLabel(s))}</span>` : ''}</div>
        <div class="hint mt-2">${esc(s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas)}${s.nisn ? ' · NISN ' + esc(s.nisn) : ''}</div>
      </div>
      ${tunggakBadge(s)}
    </div>`).join('');
  dd.style.display = 'block';
}

function hoverInputNamaItem(idx) {
  inputNamaSuggIdx = idx;
  document.querySelectorAll('.input-nama-item').forEach((el, i) => {
    el.style.background = i === idx ? 'var(--primary-pale)' : '';
  });
}

function onInputNamaKeydown(e) {
  const items = document.querySelectorAll('.input-nama-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    inputNamaSuggIdx = Math.min(inputNamaSuggIdx + 1, items.length - 1);
    items.forEach((el, i) => el.style.background = i === inputNamaSuggIdx ? 'var(--primary-pale)' : '');
    items[inputNamaSuggIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    inputNamaSuggIdx = Math.max(inputNamaSuggIdx - 1, 0);
    items.forEach((el, i) => el.style.background = i === inputNamaSuggIdx ? 'var(--primary-pale)' : '');
    items[inputNamaSuggIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && inputNamaSuggIdx >= 0) {
    const nama = items[inputNamaSuggIdx].dataset.nama;
    if (nama) selectInputNama(nama);
  } else if (e.key === 'Escape') {
    hideInputNamaDropdown();
  }
}

function selectInputNama(nama) {
  // Keranjang milik satu santri — ganti santri berarti keranjang dikosongkan.
  const lama = document.getElementById('inputNama').value;
  if (inputCart.length && lama !== nama) {
    if (!confirm(`Keranjang ${lama} masih berisi ${inputCart.length} item dan akan dikosongkan. Lanjut ganti santri?`)) {
      hideInputNamaDropdown();
      document.getElementById('inputNamaSearch').value = lama;
      return;
    }
    clearCart();
  }
  document.getElementById('inputNama').value = nama;
  document.getElementById('inputNamaSearch').value = nama;
  document.getElementById('inputNamaSearch').style.borderColor = 'var(--primary)';
  setTimeout(() => document.getElementById('inputNamaSearch').style.borderColor = '', 1500);
  hideInputNamaDropdown();
  onStudentSelect();
}

function hideInputNamaDropdown() {
  const dd = document.getElementById('inputNamaDropdown');
  if (dd) dd.style.display = 'none';
  inputNamaSuggIdx = -1;
}

// Toggle "Tampilkan santri non-aktif": fokuskan kolom pencarian lalu refresh
// dropdown, supaya daftar (termasuk santri lama) langsung muncul & tidak
// tertutup oleh blur/klik-di-luar saat mencentang.
function onToggleShowNonAktif() {
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) searchEl.focus();
  onInputNamaSearch();
}

// Sembunyikan dropdown saat kolom pencarian kehilangan fokus — kecuali fokus
// pindah ke elemen lain di dalam field nama (mis. checkbox non-aktif).
function onInputNamaBlur() {
  setTimeout(() => {
    const field = document.getElementById('inputNamaField');
    if (!field || !field.contains(document.activeElement)) hideInputNamaDropdown();
  }, 200);
}

// Tutup dropdown saat klik di luar area field nama (search + checkbox non-aktif)
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('inputNamaField') || document.getElementById('inputNamaSearch')?.closest('div');
  if (wrap && !wrap.contains(e.target)) hideInputNamaDropdown();
});

function onStudentSelect() {
  const nama = document.getElementById('inputNama').value;
  const s = getStudent(nama);
  if (!s) {
    document.getElementById('inputKelas').textContent = '—';
    document.getElementById('inputNISN').textContent = '—';
    document.getElementById('studentSummary').innerHTML = '';
    renderPaymentItems();
    return;
  }
  document.getElementById('inputKelas').textContent = kelasLabel(s);
  document.getElementById('inputNISN').textContent = s.nisn || '(belum diisi)';

  // Fakta ringkas santri saja. Rincian tunggakan sengaja TIDAK diulang di sini:
  // blok ini dulu menyalin persis isi panel "Total Seluruh Tunggakan" di kolom
  // kanan, sehingga angka yang sama terbaca dua kali dalam satu layar. Panel
  // kanan yang dipertahankan karena sekaligus punya tombol centang-semua.
  const bulanTerbayar = (s.spp_paid_months || []).length;
  // Santri yang masuk di tengah TA hanya ditagih sejak bulan masuknya.
  const bulanDitagih  = sppBillableMonths(s).length;
  document.getElementById('studentSummary').innerHTML = `
    <div class="summary-grid">
      <div class="hint">SPP per bulan</div>
      <div class="fs-12-5 fw-700">${s.spp > 0 ? rp(s.spp) : '<span class="text-muted fw-400">Belum diisi</span>'}</div>
      <div class="hint">Bulan SPP terbayar</div>
      <div class="fs-12-5 fw-700">${bulanTerbayar} <span class="fw-400 text-muted">dari ${bulanDitagih} bulan${sppMulaiLabel(s) ? ' (mulai ' + esc(sppMulaiLabel(s)) + ')' : ''}</span></div>
    </div>
  `;
  renderPaymentItems(s);

  // Ambil kondisi TERBARU santri ini dari server: bulan SPP / sisa tagihannya
  // bisa saja baru dilunasi lewat device lain. Tanpa ini, admin bisa menagih
  // (dan menerima) pembayaran yang sebenarnya sudah lunas.
  refreshSelectedStudent(s.nama);
}

// Apakah admin sudah mencentang sesuatu di form input?
// Bila ya, form JANGAN digambar ulang oleh sinkronisasi latar belakang.
function inputFormHasSelection() {
  return inputCart.length > 0;
}

let _refreshSelSeq = 0;
const _refreshSelAt = {};   // nama → timestamp terakhir diperiksa
async function refreshSelectedStudent(nama) {
  if (typeof refreshStudent !== 'function' || !nama) return;
  // Jangan menembak server berkali-kali untuk santri yang sama dalam sekejap
  // (onStudentSelect dipanggil ulang setiap kali data berubah).
  if (Date.now() - (_refreshSelAt[nama] || 0) < 5000) return;
  _refreshSelAt[nama] = Date.now();

  const seq = ++_refreshSelSeq;
  let changed = false;
  try { changed = await refreshStudent(nama); } catch { return; }
  if (!changed || seq !== _refreshSelSeq) return;
  if (document.getElementById('inputNama')?.value !== nama) return;

  if (inputFormHasSelection()) {
    // Ada centang yang sedang dikerjakan — jangan hapus isian admin, cukup beri
    // tahu bahwa datanya berubah di server.
    showSyncIndicator('🔄 Data santri ini berubah di device lain', 4000);
    return;
  }
  onStudentSelect();
}

// Dipanggil sinkronisasi latar belakang (js/sync.js) setelah data ditarik ulang.
// Hanya menggambar ulang bila form input sedang kosong, supaya centang yang
// sedang dikerjakan tidak hilang di tengah jalan.
function refreshInputPageIfIdle() {
  const el = document.getElementById('inputNama');
  const nama = el ? el.value : '';
  if (!nama || !getStudent(nama)) return;
  if (inputFormHasSelection()) return;
  onStudentSelect();
}

// Daftar item pembayaran yang berlaku untuk siswa terpilih. Dipakai bersama
// oleh renderPaymentItems, calcTotal, dan submitPayment agar selalu sinkron.
//   1. Item aktif yang cocok kelas siswa (atau semua item aktif bila belum
//      memilih siswa).
//   2. PLUS item tagihan siswa yang MASIH ada sisa, walaupun itemnya sudah
//      dinonaktifkan / dihapus atau kelasnya tak lagi cocok — supaya tunggakan
//      lama tetap bisa dilunasi (penting untuk santri non-aktif: lulus/pindah/keluar).
//   Pengecualian: santri LULUS tidak menampilkan SPP tahun berjalan (bulanan),
//      karena kewajibannya sudah pindah ke "tunggakan tahun lalu" (spp_history).
function getInputItems(student) {
  const list = [];
  const seen = new Set();
  appState.payItems.forEach(i => {
    if (!i.active) return;
    if (!i.kelas || !i.kelas.length) return;
    if (student && !(i.kelas || []).includes(String(student.kelas))) return;
    if (i.type === 'bulanan' && student && student.status_kelulusan === 'lulus') return;
    list.push(i);
    seen.add(i.id);
  });
  if (student) {
    appState.tagihan
      .filter(t => t.nama === student.nama && Math.max(0, (t.nominal || 0) - (t.paid_amount || 0)) > 0)
      .forEach(t => {
        if (seen.has(t.item_id)) return;
        const def = appState.payItems.find(i => i.id === t.item_id);
        list.push({
          id: t.item_id,
          name: (def && def.name) || t.item_name || t.item_id,
          amount: t.nominal || 0,
          type: 'tetap',
          active: true,
          kelas: [],
          _fromTagihan: true, // penanda: berasal dari tagihan lama (item nonaktif/terhapus)
        });
        seen.add(t.item_id);
      });
  }
  return list;
}

// ══════════════════════════════════════════
// KARTU TAGIHAN — gaya kasir (POS)
// ══════════════════════════════════════════
// Klik chip bulan / tombol "Lunas" langsung memasukkan baris ke keranjang (klik
// lagi = keluarkan). Bayar sebagian = ubah nominal baris itu di keranjang.
// Keranjang lalu disimpan sekaligus jadi SATU kuitansi (lihat submitPayment).

// Nominal SPP per bulan yang dipakai form (SPP santri, atau nominal baku item).
function sppInputRate(student) {
  if (!student) return 0;
  const it = getInputItems(student).find(i => i.type === 'bulanan');
  return Number(student.spp) || Number(it && it.amount) || 0;
}

// Sisa bulan `m` tahun berjalan yang masih harus dibayar (memperhitungkan angsuran).
function sppInputSisa(student, m) {
  if (!student || (student.spp_paid_months || []).includes(m)) return 0;
  const a = (student.spp_angsur && Number(student.spp_angsur[m])) || 0;
  return Math.max(0, sppInputRate(student) - a);
}

function inputStudent() {
  return getStudent(document.getElementById('inputNama').value);
}

function renderPaymentItems(student) {
  const cont = document.getElementById('paymentItems');
  inputPrevArrears = student ? sppTunggakanPrevList(student) : [];
  if (!student) {
    cont.innerHTML = `<div class="pos-empty"><svg class="ic"><use href="#i-info"/></svg> Pilih santri dulu — tagihannya akan muncul di sini.</div>`;
    syncChips(); calcTotal();
    return;
  }
  const activeItems = getInputItems(student);
  if (!activeItems.length && !inputPrevArrears.length) {
    cont.innerHTML = '<div class="pos-empty">Tidak ada item aktif. Aktifkan di menu "Kelola Item Bayar"</div>';
    return;
  }
  const chip = (key, onclick, label, sub, cls) =>
    `<button type="button" class="pos-chip ${cls}" data-key="${esc(key)}" onclick="${onclick}" aria-pressed="false">
      <span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;

  const cards = activeItems.map(item => {
    const tagih = findTagihan(student.nama, item.id);
    const head = (right) => `<div class="pos-card-head">
        <div class="pos-card-name">${esc(item.name)}${item._fromTagihan ? ' <span class="pos-tag danger">tunggakan lama</span>' : ''}</div>
        <div class="pos-card-meta">${right}</div></div>`;

    if (item.type === 'bulanan') {
      const rate = sppInputRate(student);
      const tunggak = sppUnpaidDueMonths(student);
      const dimuka  = sppUpcomingMonths(student);
      if (!tunggak.length && !dimuka.length) return doneRow(item.name, 'lunas', 'Semua bulan sudah lunas');
      if (rate <= 0) return doneRow(item.name, 'warn', 'Nominal SPP santri belum diatur');
      const mulaiSpp = sppMulaiLabel(student);
      const mchip = (m, due) => {
        const dibayar = sppBulanDibayar(student, m);
        return chip('cur||' + m, `toggleCartLine('cur','${m}',this)`, esc(MONTH_FULL[m]),
          dibayar > 0 ? 'sisa ' + rp(sppInputSisa(student, m)) : '', (due ? 'due' : 'ahead') + (dibayar > 0 ? ' partial' : ''));
      };
      return `<div class="pos-card">${head(rp(rate) + '/bln')}
        ${mulaiSpp ? `<div class="pos-note"><svg class="ic"><use href="#i-cal"/></svg> Santri masuk di tengah tahun ajaran — SPP dihitung mulai <strong>${esc(mulaiSpp)}</strong>.</div>` : ''}
        ${tunggak.length
          ? `<div class="pos-label danger">Menunggak · ${tunggak.length} bulan</div><div class="pos-chips">${tunggak.map(m => mchip(m, true)).join('')}</div>`
          : `<div class="pos-note ok"><svg class="ic"><use href="#i-check"/></svg> Tidak ada tunggakan SPP s/d bulan berjalan</div>`}
        ${dimuka.length ? `<details class="pos-more"><summary>Bayar di muka · ${dimuka.length} bulan</summary>
          <div class="pos-chips">${dimuka.map(m => mchip(m, false)).join('')}</div></details>` : ''}
      </div>`;
    }

    if (item.type === 'tetap') {
      const sisa = tagih ? Math.max(0, tagih.nominal - tagih.paid_amount) : (item.amount || 0);
      // "Nominal belum diatur" & "lunas" tak boleh bergantung pada adanya tagihan
      // (item aktif tanpa tagihan bernominal 0 dulu tampil sebagai "Rp 0").
      if (tagih ? tagih.nominal <= 0 : (item.amount || 0) <= 0) return doneRow(item.name, 'warn', 'Nominal belum diatur — atur di "Kelola Item Bayar"');
      if (sisa <= 0) return doneRow(item.name, 'lunas', 'Lunas ' + rp(tagih.nominal));
      const id = escJs(item.id);
      return `<div class="pos-card">${head(tagih
          ? `sisa <strong class="danger">${rp(sisa)}</strong> dari ${rp(tagih.nominal)}`
          : `${rp(sisa)} <span class="muted">(belum ditagihkan)</span>`)}
        ${tagih && tagih.paid_amount > 0 ? `<div class="pos-progress"><i style="width:${Math.min(100, tagih.paid_amount / tagih.nominal * 100)}%"></i></div>` : ''}
        <div class="pos-actions">
          ${chip('tetap||' + item.id, `toggleCartLine('tetap','${id}',this)`, 'Lunas ' + rp(sisa), '', 'due wide')}
          <button type="button" class="pos-ghost-btn" onclick="angsurLine('tetap','${id}',this)">✎ Bayar sebagian</button>
        </div></div>`;
    }

    // custom: nominal diketik bebas.
    if (tagih && tagih.nominal > 0 && (tagih.nominal - tagih.paid_amount) <= 0) return doneRow(item.name, 'lunas', 'Lunas ' + rp(tagih.nominal));
    return `<div class="pos-card">${head('nominal bebas')}
      <div class="pos-actions">
        <input type="number" id="custom_${esc(item.id)}" class="pos-input" placeholder="Nominal..." min="1" aria-label="Nominal ${esc(item.name)}"
          onkeydown="if(event.key==='Enter')addCustomLine('${escJs(item.id)}',this)">
        <button type="button" class="pos-chip due" data-key="${esc('custom||' + item.id)}" onclick="addCustomLine('${escJs(item.id)}',this)"><span>+ Tambah</span></button>
      </div></div>`;
  }).join('');

  cont.innerHTML = renderArrearsBanner(student, inputPrevArrears) + cards
    + (inputPrevArrears.length ? renderPrevArrearsBlock(inputPrevArrears, chip) : '');
  syncChips();
  calcTotal();
}

// Item yang tak perlu tindakan (lunas / nominal belum diatur): satu baris tipis.
function doneRow(name, kind, text) {
  return `<div class="pay-item-done ${kind === 'warn' ? 'is-warn' : 'is-lunas'}">
    <span class="pid-mark">${kind === 'warn' ? '<svg class="ic"><use href="#i-alert"/></svg>' : '✓'}</span>
    <span class="pid-name">${esc(name)}</span>
    <span class="pid-note">${esc(text)}</span>
  </div>`;
}

// Ringkasan seluruh tunggakan santri + tombol "masukkan semua".
function renderArrearsBanner(student, prevList) {
  const sppNow = sppTunggakan(student);
  const bulanNow = (student.spp || 0) > 0 ? sppUnpaidDueMonths(student).length : 0;
  const baris = [];
  if (sppNow > 0) baris.push({ label: `SPP tahun berjalan (${bulanNow} bln)`, amount: sppNow });
  prevList.forEach(y => baris.push({ label: `SPP TA ${y.ta} (${y.unpaid.length} bln)`, amount: y.amount }));
  appState.tagihan
    .filter(t => t.nama === student.nama && Math.max(0, (t.nominal || 0) - (t.paid_amount || 0)) > 0)
    .forEach(t => baris.push({ label: t.item_name, amount: Math.max(0, t.nominal - t.paid_amount) }));
  const total = baris.reduce((a, r) => a + r.amount, 0);
  if (total <= 0) return `<div class="pos-banner ok"><svg class="ic"><use href="#i-check"/></svg> Tidak ada tunggakan — seluruh kewajiban ${esc(student.nama)} sudah lunas</div>`;
  return `<div class="pos-banner">
    <div class="pos-banner-top">
      <div><div class="pos-banner-label">Total tunggakan</div><div class="pos-banner-total">${rp(total)}</div></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="selectAllTunggakan(this)"><svg class="ic"><use href="#i-zap"/></svg> Masukkan semua</button>
    </div>
    <div class="pos-banner-rows">${baris.map(r => `<span>${esc(r.label)}</span><b>${rp(r.amount)}</b>`).join('')}</div>
  </div>`;
}

// Tunggakan SPP tahun ajaran sebelumnya: chip per bulan per TA.
function renderPrevArrearsBlock(list, chip) {
  return `<div class="pos-card prev">
    <div class="pos-card-head"><div class="pos-card-name danger"><svg class="ic"><use href="#i-alert"/></svg> Tunggakan SPP TA sebelumnya</div>
      <div class="pos-card-meta">${rp(list.reduce((a, y) => a + y.amount, 0))}</div></div>
    ${list.map(y => `<div class="pos-label">TA ${esc(y.ta)}${y.kelas ? ' · Kelas ' + esc(y.kelas) : ''}</div>
      <div class="pos-chips">${y.detail.map(d => chip('prev|' + y.ta + '|' + d.m,
        `toggleCartLine('prev','${escJs(y.ta)}|${d.m}',this)`, esc(MONTH_FULL[d.m]), rp(d.sisa),
        'due' + (d.dibayar > 0 ? ' partial' : ''))).join('')}</div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// KERANJANG
// ══════════════════════════════════════════
// Tiap baris = satu bulan / satu item:
//   { kind:'cur'|'prev'|'tetap'|'custom', id, base, m, ta, rate,
//     amount, max (sisa yang boleh dibayar), paidBefore (sudah diangsur) }
let inputCart = [];
let _cartBaru = '';   // key baris terakhir yang masuk (untuk animasi)

const cartKey = l => l.kind + '|' + (l.ta || '') + '|' + (l.m || l.id);

// Nama baris untuk kuitansi: penanda (Angsur)/(Pelunasan Angsur) mengikuti nominal.
function cartLineName(l) {
  if (l.kind === 'custom') return l.base;
  const base = l.kind === 'prev' ? `SPP Tunggakan TA ${l.ta}` : l.base;
  if (l.amount < l.max) return base + ' (Angsur)';
  return base + (l.paidBefore > 0 ? ' (Pelunasan Angsur)' : '');
}

// Baris keranjang (nominal awal = sisa penuh) untuk satu pilihan. null bila tak ada sisa.
function lineFor(student, kind, ref) {
  if (kind === 'cur') {
    const it = getInputItems(student).find(i => i.type === 'bulanan');
    const sisa = sppInputSisa(student, ref);
    return sisa > 0 ? { kind, id: it ? it.id : 'spp', base: it ? it.name : 'SPP Bulanan', m: ref,
      amount: sisa, max: sisa, paidBefore: sppBulanDibayar(student, ref) } : null;
  }
  if (kind === 'prev') {
    const [ta, m] = ref.split('|');
    const y = inputPrevArrears.find(p => p.ta === ta);
    const d = y && y.detail.find(x => x.m === m);
    return d && d.sisa > 0 ? { kind, id: 'spp', ta, rate: y.rate, m, amount: d.sisa, max: d.sisa, paidBefore: d.dibayar } : null;
  }
  if (kind === 'tetap') {
    const item = getInputItems(student).find(i => i.id === ref);
    const t = findTagihan(student.nama, ref);
    const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : ((item && item.amount) || 0);
    return item && sisa > 0 ? { kind, id: ref, base: item.name, amount: sisa, max: sisa } : null;
  }
  return null;
}

// Klik chip: masuk keranjang, atau keluar bila sudah ada.
function toggleCartLine(kind, ref, el) {
  const student = inputStudent();
  if (!student) return;
  const l = lineFor(student, kind, ref);
  if (!l) return;
  const i = inputCart.findIndex(x => cartKey(x) === cartKey(l));
  if (i >= 0) inputCart.splice(i, 1);
  else { inputCart.push(l); _cartBaru = cartKey(l); flyToCart(el); }
  afterCartChange();
}

// "Bayar sebagian": pastikan baris ada di keranjang, lalu fokus ke nominalnya.
function angsurLine(kind, ref, el) {
  const student = inputStudent();
  const l = student && lineFor(student, kind, ref);
  if (!l) return;
  if (!inputCart.some(x => cartKey(x) === cartKey(l))) { inputCart.push(l); _cartBaru = cartKey(l); flyToCart(el); }
  afterCartChange();
  const inp = document.querySelector(`#inputCart [data-key="${CSS.escape(cartKey(l))}"] input`);
  if (inp) { inp.focus(); inp.select(); }
}

function addCustomLine(id, el) {
  const student = inputStudent();
  const inp = document.getElementById('custom_' + id);
  const amt = Math.round(Number(inp && inp.value) || 0);
  const item = student && getInputItems(student).find(i => i.id === id);
  if (!item) return;
  if (amt <= 0) { toast('⚠️ Isi nominalnya dulu'); if (inp) inp.focus(); return; }
  const l = { kind: 'custom', id, base: item.name, amount: amt, max: Infinity };
  const ada = inputCart.find(x => cartKey(x) === cartKey(l));
  if (ada) ada.amount = amt; else inputCart.push(l);
  _cartBaru = cartKey(l);
  flyToCart(el);
  if (inp) inp.value = '';
  afterCartChange();
}

// Masukkan seluruh tunggakan (bulan jatuh tempo, TA lalu, sisa tagihan) sekaligus.
function selectAllTunggakan(el) {
  const student = inputStudent();
  if (!student) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const ada = new Set(inputCart.map(cartKey));
  const baru = [
    ...sppUnpaidDueMonths(student).map(m => lineFor(student, 'cur', m)),
    ...inputPrevArrears.flatMap(y => y.detail.map(d => lineFor(student, 'prev', y.ta + '|' + d.m))),
    ...getInputItems(student).filter(i => i.type === 'tetap').map(i => lineFor(student, 'tetap', i.id)),
  ].filter(l => l && !ada.has(cartKey(l)));
  if (!baru.length) { toast('Semua tunggakan sudah ada di keranjang'); return; }
  inputCart.push(...baru);
  _cartBaru = cartKey(baru[baru.length - 1]);
  flyToCart(el);
  afterCartChange();
  toast(`🛒 ${baru.length} tunggakan masuk keranjang — periksa sebelum membayar`);
}

function removeCartLine(i) {
  const row = document.querySelectorAll('#inputCart .cart-row')[i];
  const hapus = () => { inputCart.splice(i, 1); afterCartChange(); };
  if (row && row.animate && !_reduceMotion()) row.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }],
    { duration: 180, easing: 'ease-in' }).onfinish = hapus;
  else hapus();
}

function editCartLine(i, el) {
  const l = inputCart[i];
  if (!l) return;
  const v = Math.round(Number(el.value) || 0);
  if (v <= 0) { toast('⚠️ Nominal harus lebih dari 0 — pakai ✕ untuk menghapus baris.'); renderCart(); return; }
  l.amount = Math.min(l.max, v);
  if (v > l.max) toast(`⚠️ Maksimal ${rp(l.max)} (sisa tagihan)`);
  renderCart();
  calcTotal();
}

function clearCart() {
  inputCart = [];
  renderCart();
  syncChips();
}

function afterCartChange() {
  renderCart();
  syncChips();
  calcTotal();
}

// Tandai chip yang barisnya sedang ada di keranjang.
function syncChips() {
  const ada = new Set(inputCart.map(cartKey));
  document.querySelectorAll('#paymentItems [data-key]').forEach(el => {
    const on = ada.has(el.dataset.key);
    el.classList.toggle('in-cart', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function renderCart() {
  const box = document.getElementById('inputCart');
  const count = document.getElementById('cartCount');
  if (count) {
    count.textContent = inputCart.length;
    count.classList.toggle('show', inputCart.length > 0);
  }
  if (!box) return;
  if (!inputCart.length) {
    box.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon"><svg class="ic"><use href="#i-cart"/></svg></div>Keranjang kosong<br><small>Klik bulan atau tombol <b>Lunas</b> di daftar tagihan</small></div>`;
    _cartBaru = '';
    return;
  }
  box.innerHTML = inputCart.map((l, i) => {
    const sebagian = l.max !== Infinity && l.amount < l.max;
    return `<div class="cart-row${cartKey(l) === _cartBaru ? ' is-new' : ''}" data-key="${esc(cartKey(l))}">
      <div class="cart-row-info">
        <div class="cart-row-name">${esc(l.kind === 'prev' ? 'SPP TA ' + l.ta : l.base)}${l.m ? ' · <b>' + esc(MONTH_FULL[l.m]) + '</b>' : ''}</div>
        ${sebagian ? `<div class="cart-row-sub"><span class="pos-tag">Angsur</span> sisa ${rp(l.max - l.amount)} tetap menunggak</div>`
          : l.paidBefore > 0 ? `<div class="cart-row-sub"><span class="pos-tag ok">Pelunasan</span></div>` : ''}
      </div>
      <label class="cart-amount" title="Ubah nominal untuk bayar sebagian">✎
        <input type="number" value="${l.amount}" min="1" ${l.max !== Infinity ? `max="${l.max}"` : ''}
          onchange="editCartLine(${i}, this)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Nominal ${esc(cartLineName(l))}">
      </label>
      <button type="button" class="cart-del" onclick="removeCartLine(${i})" aria-label="Hapus ${esc(cartLineName(l))}">✕</button>
    </div>`;
  }).join('');
  _cartBaru = '';
}

function calcTotal() {
  const total = inputCart.reduce((a, l) => a + l.amount, 0);
  const el = document.getElementById('inputTotal');
  if (el && el.textContent !== rp(total)) {
    el.textContent = rp(total);
    if (el.animate && !_reduceMotion()) el.animate(
      [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }
  const bar = document.getElementById('cartMiniBar');
  if (bar) {
    bar.classList.toggle('show', inputCart.length > 0);
    bar.querySelector('span').textContent = `${inputCart.length} item · ${rp(total)}`;
  }
}

function _reduceMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Animasi "terbang ke keranjang": salinan chip melengkung ke panel keranjang
// (atau ke bar mini di HP bila panelnya di luar layar).
function flyToCart(el) {
  if (!el || !el.animate || _reduceMotion()) return;
  const cart = document.getElementById('cartPanel');
  const bar = document.getElementById('cartMiniBar');
  let target = cart && cart.getBoundingClientRect();
  if (!target || target.top > window.innerHeight || target.bottom < 0) target = bar && bar.getBoundingClientRect();
  if (!target) return;
  const a = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('pos-fly');
  Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(ghost);
  const dx = target.left + Math.min(target.width / 2, 120) - (a.left + a.width / 2);
  const dy = target.top + 40 - (a.top + a.height / 2);
  ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) scale(.85)`, opacity: .95, offset: .55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0 },
  ], { duration: 600, easing: 'cubic-bezier(.45,0,.25,1)' }).onfinish = () => {
    ghost.remove();
    const badge = document.getElementById('cartCount');
    if (badge && badge.animate) badge.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  };
}

// Gabungkan baris keranjang jadi item pembayaran (format lama submitPayment):
// bulan-bulan dengan nama sama dijadikan satu item ber-bulanList.
function linesToItems(lines) {
  const items = [], byKey = {};
  lines.forEach(l => {
    const name = cartLineName(l);
    if (l.kind === 'tetap' || l.kind === 'custom') {
      items.push({ id: l.id, type: l.kind, name, amount: l.amount, bulan: null });
      return;
    }
    const k = l.kind + '|' + (l.ta || '') + '|' + name;
    let it = byKey[k];
    if (!it) {
      it = byKey[k] = { id: l.id, type: l.kind === 'prev' ? 'spp_prev' : 'bulanan', name, amount: 0,
        bulanList: [], bulanAmounts: {}, angsurMonths: [], ...(l.kind === 'prev' ? { ta: l.ta, rate: l.rate } : {}) };
      items.push(it);
    }
    it.amount += l.amount;
    it.bulanList.push(l.m);
    it.bulanAmounts[l.m] = l.amount;
    if (l.amount < l.max || l.paidBefore > 0) it.angsurMonths.push(l.m);
  });
  return items;
}

// Sisa TERBARU yang boleh dibayar untuk satu baris (dibaca dari appState
// setelah refreshStudent), untuk menolak baris yang sudah dibayar perangkat lain.
function cartLineFreshMax(l, student) {
  if (l.kind === 'cur')  return sppInputSisa(student, l.m);
  if (l.kind === 'prev') return sppTunggakanPrevList(student).find(y => y.ta === l.ta)?.detail.find(d => d.m === l.m)?.sisa || 0;
  if (l.kind === 'tetap') {
    const t = findTagihan(student.nama, l.id);
    return t ? Math.max(0, t.nominal - t.paid_amount) : l.max;
  }
  return l.max;
}

// Cegah klik "Simpan" dua kali tercatat sebagai dua pembayaran.
let _menyimpanBayar = false;
async function submitPayment() {
  if (_menyimpanBayar) { toast('⏳ Pembayaran sedang disimpan...'); return; }
  _menyimpanBayar = true;
  try { await _submitPayment(); }
  finally { _menyimpanBayar = false; }
}

async function _submitPayment() {
  const nama = document.getElementById('inputNama').value;
  if (!nama) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const lines = [...inputCart];
  if (!lines.length) { toast('⚠️ Keranjang masih kosong — klik tagihan yang mau dibayar.'); return; }

  // Keranjang bisa berumur beberapa menit: pastikan tak ada yang sudah dibayar
  // dari perangkat lain sementara itu.
  try { await refreshStudent(nama); } catch { /* offline: penyimpanan di bawah yang gagal */ }
  const student = getStudent(nama);
  const basi = lines.filter(l => l.amount > cartLineFreshMax(l, student));
  if (basi.length) {
    inputCart = inputCart
      .map(l => { const mx = cartLineFreshMax(l, student); return { ...l, max: mx, amount: Math.min(l.amount, mx) }; })
      .filter(l => l.max > 0);
    renderCart();
    renderPaymentItems(student);
    toast('⚠️ ' + basi.map(l => cartLineName(l) + (l.m ? ' ' + MONTH_FULL[l.m] : '')).join(', ')
      + ' sudah dibayar/berubah dari perangkat lain — keranjang disesuaikan, periksa lalu simpan lagi.', 9000);
    return;
  }
  // Angsuran SPP tahun berjalan butuh kolom spp_angsur & nominal SPP santri.
  if (lines.some(l => l.kind === 'cur' && l.amount < l.max)) {
    if (!(Number(student.spp) > 0)) { toast('⚠️ Nominal SPP santri belum diatur — angsuran tidak bisa dihitung sisanya.'); return; }
    if (!sppAngsurKolomAda()) { toast('⚠️ ' + SPP_ANGSUR_MIGRASI_MSG, 9000); return; }
  }
  const items = linesToItems(lines);

  // Kumpulkan perubahan sebagai SELISIH (bulan baru & nominal tambahan), lalu
  // digabungkan ke kondisi terbaru di server. Jangan menghitung nilai akhir
  // dari salinan lokal: bila device lain sudah menginput lebih dulu, salinan
  // lokal sudah usang dan pembayaran mereka akan tertimpa.
  //   • bulan lunas biasa  → tandai lunas
  //   • angsuran/pelunasan → tambah nominal; lunas otomatis bila mencapai SPP
  //   • tunggakan TA lalu  → tambah nominal pada bulan TA tersebut
  const sppOps = { cur: [], hist: [] };
  const tagihanUpdates = [];             // { id, delta }
  items.forEach(it => {
    if (it.type === 'spp_prev') {
      (it.bulanList || []).forEach(b => sppOps.hist.push({ ta: it.ta, m: b, delta: it.bulanAmounts[b], rate: it.rate }));
    } else if (it.bulanList?.length) {
      it.bulanList.forEach(b => {
        if ((it.angsurMonths || []).includes(b)) sppOps.cur.push({ m: b, delta: it.bulanAmounts[b] });
        else sppOps.cur.push({ m: b, add: true });
      });
    }
    if (it.type === 'tetap') {
      const t = findTagihan(nama, it.id);
      if (t) tagihanUpdates.push({ id: t.id, delta: it.amount });
    }
  });

  // Tanggal/jam & metode pembayaran dari form (bisa hari ini atau tanggal lain)
  const timeStr = buildInputTimeStr();
  const meta = getPaymentMeta();
  const totalAmt = items.reduce((a,i)=>a+i.amount,0);
  const txn = {
    nama, kelas: student.kelas,
    jenis: items.map(i => i.bulanList?.length ? i.name+' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')' : i.name).join(', '),
    nominal: totalAmt, time: timeStr, catatan: document.getElementById('inputCatatan').value,
    metode: meta.metode, dibayar_oleh: meta.dibayar_oleh,
  };

  // Simpan ke tabel kuitansi Supabase (await agar ID tersedia saat cetak)
  const noKwt = await generateNoKuitansi();
  const kwtData = {
    no_kuitansi: noKwt,
    nama, kelas: student.kelas, nisn: student.nisn||'',

    // Rincian per bulan: pakai nominal asli tiap bulan bila ada (tunggakan lama
    // bisa beda nominal per bulan / sisa angsuran), selain itu bagi rata.
    items: items.flatMap(i => {
      // `angsur` & `ta` dipakai saat kuitansi dihapus/dikoreksi supaya efeknya
      // dibalik sebesar nominalnya, di tempat yang benar (lihat sppRevertOp).
      if (i.bulanList?.length) return i.bulanList.map(b => ({
        item_id: i.id, name: i.name,
        amount: (i.bulanAmounts && i.bulanAmounts[b] != null) ? i.bulanAmounts[b] : i.amount / i.bulanList.length,
        bulan: b,
        ...((i.angsurMonths || []).includes(b) ? { angsur: true } : {}),
        ...(i.type === 'spp_prev' ? { ta: i.ta, rate: i.rate } : {}),
      }));
      return [{ item_id: i.id, name: i.name, amount: i.amount, bulan: i.bulan || null }];
    }),
    total: totalAmt, catatan: txn.catatan, dicetak: false,
    ta_label: getProfil().ta || '',
    metode: meta.metode, dibayar_oleh: meta.dibayar_oleh, tgl_bayar: timeStr,
  };
  // Kuitansi (buku besar) disimpan LEBIH DULU: bila gagal, belum ada data yang
  // berubah dan admin cukup mengulang. Bila data santri yang gagal sesudahnya,
  // kuitansinya sudah ada sehingga menu Periksa & Pulihkan bisa memulihkannya.
  try {
    const res = await insertKuitansi(kwtData);
    pendingKwtId = res?.[0]?.id || null;
  } catch (e) {
    console.error('insertKuitansi:', e);
    toast('⚠️ Gagal menyimpan kuitansi — belum ada yang tercatat, silakan coba lagi. (' + e.message + ')', 9000);
    return;
  }
  pendingKwtData = { ...kwtData, time: timeStr };

  appState.transactions.push(txn);
  // Tulis-gabung ke server (baca kondisi terbaru → tambahkan perubahan ini).
  try {
    await commitSppOps(nama, sppOps);
    await Promise.all(tagihanUpdates.map(u => addTagihanPaid(u.id, u.delta)));
  } catch (e) {
    console.error('submitPayment data:', e);
    toast(`⚠️ Kuitansi ${kwtData.no_kuitansi} tersimpan, tapi data tunggakan santri gagal diperbarui (${e.message}). `
      + 'JANGAN input ulang — jalankan menu Periksa & Pulihkan.', 12000);
  }
  saveTransaction(txn);

  // Render session table
  const tbody = document.querySelector('#sessionTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${esc(nama)}</strong></td><td>${esc(student.kelas)}</td><td>${esc(items.map(i=>i.name+(i.bulanList?.length?' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')':i.bulan?' ('+MONTH_FULL[i.bulan]+')':'')).join(', '))}</td><td><strong>${rp(totalAmt)}</strong></td><td>${esc(timeStr)}</td><td class="nowrap"><button class="btn btn-primary btn-sm" onclick="cetakKuitansiById('${escJs(nama)}','${escJs(timeStr)}')"><svg class="ic"><use href="#i-print"/></svg> Kuitansi</button> <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">✕</button></td>`;
  if(tbody.firstChild?.tagName==='TR' && tbody.firstChild.querySelector('[colspan]')) tbody.innerHTML='';
  tbody.prepend(row);

  // Reset form
  document.getElementById('inputNama').value='';
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) { searchEl.value=''; searchEl.style.borderColor=''; }
  document.getElementById('inputKelas').textContent='—';
  document.getElementById('inputNISN').textContent='—';
  document.getElementById('studentSummary').innerHTML='';
  document.getElementById('inputCatatan').value='';
  resetPaymentMeta();
  clearCart();
  renderPaymentItems();

  // Tampilkan popup konfirmasi cetak
  document.getElementById('modalCetakNama').textContent = nama + ' — ' + student.kelas;
  document.getElementById('modalCetakTotal').textContent = rp(totalAmt);
  document.getElementById('modalCetakKwt').style.display = 'flex';
}

async function cetakKuitansi(data) {
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }

  // Pastikan template terbaru dari Supabase
  await loadTemplateKuitansi();

  // Gunakan no_kuitansi dari data (sudah di-generate saat simpan)
  // Jika belum ada (cetak langsung), generate baru
  if (!data.no_kuitansi) {
    data.no_kuitansi = await generateNoKuitansi();
  }

  const lembar1 = buildKuitansiHTML(data, ktData, 'Lembar Pembayar');
  const lembar2 = buildKuitansiHTML(data, ktData, 'Lembar Arsip');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Kuitansi — ${esc(data.nama)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    /* Pastikan warna pembeda lembar pembayar & arsip ikut tercetak */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { body { margin:0; background:#fff; } .no-print { display:none !important; } }
    body { font-family:'Times New Roman',serif; background:#f5f5f5; margin:0; padding:16px; }
    .kuitansi-wrap { display:flex; flex-direction:column; gap:10px; max-width:190mm; margin:0 auto; }
    hr.sep { border:none; border-top:2px dashed #aaa; margin:4px 0; }
    .print-btn { display:block; margin:0 auto 14px; padding:10px 32px; background:#1e5631; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; }
    ${KWT_CSS}
  </style></head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Cetak Kuitansi</button>
  <div class="kuitansi-wrap">
    ${lembar1}
    <hr class="sep">
    ${lembar2}
  </div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=750');
  w.document.write(html);
  w.document.close();
}

// ── DATA SISWA ──
;// ══ js/siswa.js ══
// ── SiPay · Halaman Data Siswa ──
// ── Tab Data Siswa ──
function switchSiswaTab(tab) {
  const isDaftar = tab === 'daftar';
  document.getElementById('tabSiswaDaftar').style.display = isDaftar ? 'block' : 'none';
  document.getElementById('tabSiswaLog').style.display    = isDaftar ? 'none'  : 'block';
  document.getElementById('tabSiswaBtn').style.background = isDaftar ? 'var(--primary)' : 'transparent';
  document.getElementById('tabSiswaBtn').style.color      = isDaftar ? '#fff' : 'var(--text-muted)';
  document.getElementById('tabLogBtn').style.background   = isDaftar ? 'transparent' : 'var(--primary)';
  document.getElementById('tabLogBtn').style.color        = isDaftar ? 'var(--text-muted)' : '#fff';
  if (!isDaftar) renderLogSiswa();
}

let logPage = 1;
const LOG_PER_PAGE = 50;

async function renderLogSiswa(resetPage = true) {
  const wrap = document.getElementById('logSiswaWrap');
  if (!wrap) return;
  if (resetPage) logPage = 1;
  wrap.innerHTML = '<div class="text-center text-muted p-32">Memuat...</div>';

  const q    = (document.getElementById('logSearch')?.value || '').toLowerCase().trim();

  try {
    let url = 'transactions?select=*&order=created_at.desc&limit=500';
    let rows = await sb(url);

    if (q) rows = rows.filter(r => r.nama?.toLowerCase().includes(q) || r.jenis?.toLowerCase().includes(q));

    const total      = rows.length;
    const totalPages = Math.ceil(total / LOG_PER_PAGE) || 1;
    const start      = (logPage - 1) * LOG_PER_PAGE;
    const pageRows   = rows.slice(start, start + LOG_PER_PAGE);

    if (!rows.length) {
      wrap.innerHTML = '<div class="text-center text-muted p-32 fs-13">Belum ada transaksi tercatat.</div>';
      return;
    }

    const fmt = n => Number(n||0).toLocaleString('id-ID');

    const grouped = {};
    pageRows.forEach(r => {
      const tgl = r.created_at
        ? new Date(r.created_at).toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
        : r.time || '—';
      if (!grouped[tgl]) grouped[tgl] = [];
      grouped[tgl].push(r);
    });

    const listHtml = Object.entries(grouped).map(([tgl, txns]) => `
      <div class="mb-20">
        <div class="fs-12 fw-700 text-muted mb-8 pb-6 border-b-1-border">
          <svg class="ic"><use href="#i-cal"/></svg> ${tgl}
        </div>
        ${txns.map(r => {
          const jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : r.time?.split(' ')[1] || '—';
          return `<div class="log-row">
            <div class="fs-12 text-muted nowrap minw-40">${jam}</div>
            <div class="flex-1 minw-0">
              <div class="fw-700 fs-13">${esc(r.nama)} <span class="fw-400 text-muted">— ${esc(r.kelas)}</span></div>
              <div class="fs-12 text-555 mt-2">${esc(r.jenis)}</div>
              ${r.catatan ? `<div class="hint mt-2"><svg class="ic"><use href="#i-msg"/></svg> ${esc(r.catatan)}</div>` : ''}
            </div>
            <div class="text-right nowrap">
              <div class="fw-700 fs-14 text-primary-light">Rp ${fmt(r.nominal)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('');

    const pagCtrl = totalPages > 1 ? `
      <div class="flex items-center justify-center gap-8 mt-16 fs-13">
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage-1})" ${logPage<=1?'disabled':''}>← Prev</button>
        <span class="text-muted">Hal ${logPage} / ${totalPages} &nbsp;(${total} transaksi)</span>
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage+1})" ${logPage>=totalPages?'disabled':''}>Next →</button>
      </div>` : `<div class="text-center fs-12 text-muted mt-8">${total} transaksi</div>`;

    wrap.innerHTML = listHtml + pagCtrl;

  } catch(e) {
    wrap.innerHTML = `<div class="text-danger p-16 fs-13">Gagal memuat: ${e.message}</div>`;
  }
}

function logGoPage(page) {
  logPage = page;
  renderLogSiswa(false);
}

let siswaPage = 1;
const SISWA_PER_PAGE = 50;

const STATUS_KELULUSAN_BADGE = {
  lulus:  { label: 'Lulus',  cls: 'badge-green',  icon: '<svg class="ic"><use href="#i-grad"/></svg>' },
  pindah: { label: 'Pindah', cls: 'badge-yellow', icon: '<svg class="ic"><use href="#i-refresh"/></svg>' },
  keluar: { label: 'Keluar', cls: 'badge-red',    icon: '<svg class="ic"><use href="#i-logout"/></svg>' },
};

// withTagihanIndex: selama menggambar, pencarian tagihan per santri memakai
// indeks Map — bukan memindai ulang seluruh appState.tagihan tiap baris.
function renderSiswaTable(resetPage = true) {
  return withTagihanIndex(() => _renderSiswaTable(resetPage));
}
function _renderSiswaTable(resetPage) {
  if (resetPage) siswaPage = 1;
  const q = document.getElementById('searchSiswa').value.toLowerCase();
  const sFilter = document.getElementById('filterStatus').value;
  const skFilter = document.getElementById('filterStatusKelulusan')?.value || '';
  let list = appState.students.filter(s => {
    if (q && !s.nama.toLowerCase().includes(q) && !s.nisn?.includes(q)) return false;
    if (activeKelasFilter && s.kelas !== activeKelasFilter) return false;
    if (sFilter === 'lunas' && totalTunggakan(s) > 0) return false;
    if (sFilter === 'tunggak' && totalTunggakan(s) === 0) return false;
    // Default: sembunyikan siswa tidak aktif kecuali filter eksplisit dipilih
    if (skFilter === '' && s.status_kelulusan) return false;
    if (skFilter === 'aktif' && s.status_kelulusan) return false;
    if (skFilter && skFilter !== 'aktif' && skFilter !== 'semua' && s.status_kelulusan !== skFilter) return false;
    return true;
  });
  clearSelection();

  const total      = list.length;
  const totalPages = Math.ceil(total / SISWA_PER_PAGE) || 1;
  const start      = (siswaPage - 1) * SISWA_PER_PAGE;
  const pageList   = list.slice(start, start + SISWA_PER_PAGE);

  const tbody = document.querySelector('#siswaTable tbody');
  tbody.innerHTML = pageList.map((s, i) => {
    const tunggak = totalTunggakan(s);
    // Agregat tagihan item (tetap) — pangkal/buku/seragam dll kini disimpan di tabel tagihan
    const tagT       = tagihanOf(s.nama);
    const tagNominal = tagT.reduce((a, t) => a + (t.nominal || 0), 0);
    const tagPaid    = tagT.reduce((a, t) => a + (t.paid_amount || 0), 0);
    const history = s.spp_history || {};
    const taKeys  = Object.keys(history).sort((a,b) => parseInt(a.split('/')[0]) - parseInt(b.split('/')[0]));
    let monthBadges;
    if (taKeys.length > 1) {
      monthBadges = taKeys.map(ta => {
        // Lunas bila tak ada satu pun bulan bersisa pada TA tersebut. Dihitung
        // lewat sppHistMonths agar TA yang hanya ditagih sebagian bulan (mis.
        // santri masuk di tengah tahun) tidak keliru dianggap menunggak.
        const lunas = !sppHistMonths(history[ta]).some(x => x.sisa > 0);
        const short = ta.replace(/20(\d\d)\/20(\d\d)/, '$1/$2');
        return `<span class="ta-chip ${lunas?'is-ok':'is-due'}">${short}: ${lunas?'<svg class="ic"><use href="#i-check"/></svg>':'<svg class="ic"><use href="#i-alert"/></svg>'}</span>`;
      }).join('');
    } else {
      // Lunas = hijau, menunggak (sudah jatuh tempo) = merah,
      // belum jatuh tempo = abu-abu (tidak dihitung tunggakan), dan bulan
      // sebelum santri masuk = pudar (tidak pernah ditagih).
      const mulaiTtl = sppMulaiLabel(s) ? `Sebelum masuk (SPP mulai ${sppMulaiLabel(s)})` : '';
      monthBadges = MONTHS.map(m => {
        const paid   = (s.spp_paid_months||[]).includes(m);
        const sebelum = !paid && isSppSebelumMasuk(s, m);
        const due    = !sebelum && isSppDueFor(s, m);
        const st   = paid ? 'is-paid' : due ? 'is-due' : 'is-future';
        const ang  = paid ? 0 : sppBulanDibayar(s, m);
        const ttl  = (paid ? 'Lunas' : sebelum ? mulaiTtl : due ? 'Belum bayar (jatuh tempo)' : 'Belum jatuh tempo')
          + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
        return `<span title="${esc(ttl)}" class="mchip ${st}${ang > 0 ? ' is-angsur' : ''}${sebelum ? ' is-before' : ''}">${m}</span>`;
      }).join('');
    }
    const nama_safe = escJs(s.nama);
    const no = start + i + 1;
    const sk = s.status_kelulusan || '';
    const skBadge = sk && STATUS_KELULUSAN_BADGE[sk]
      ? `<span class="badge ${STATUS_KELULUSAN_BADGE[sk].cls} ml-4">${STATUS_KELULUSAN_BADGE[sk].icon} ${STATUS_KELULUSAN_BADGE[sk].label}</span>`
      : '';
    return `<tr${sk ? ' class="row-nonaktif"' : ''}>
      <td class="chk-col"><input type="checkbox" class="row-chk" data-nama="${esc(s.nama)}" onchange="toggleRowSelect(this)"></td>
      <td>${no}</td>
      <td><strong>${esc(s.nama)}</strong>${skBadge}</td>
      <td>${esc(kelasLabel(s))}</td>
      <td>${rp(s.spp)}</td>
      <td><div class="lh-16">${monthBadges}</div></td>
      <td>
        <div>${rp(tagPaid)} / ${rp(tagNominal)}</div>
        <div class="progress-wrap mt-4"><div class="progress-bar ${pct(tagPaid,tagNominal)>=100?'green':'yellow'}" style="width:${pct(tagPaid,tagNominal)}%"></div></div>
      </td>
      <td>${tunggak>0?`<span class="badge badge-red">Tunggak ${rp(tunggak)}</span>`:'<span class="badge badge-green">✓ Lunas</span>'}</td>
      <td class="nowrap">
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nama_safe}')" title="Detail"><svg class="ic"><use href="#i-clip"/></svg> Detail</button>
        <button class="btn btn-accent btn-sm" onclick="openEditSiswa('${nama_safe}')" title="Edit data"><svg class="ic"><use href="#i-edit"/></svg> Edit</button>
        <button class="btn btn-danger btn-sm act-del" onclick="deleteSingle('${nama_safe}')" title="Hapus"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td class="text-center p-20 text-muted" colspan="9">Tidak ada data</td></tr>';

  // Pagination controls
  const existingPag = document.getElementById('siswaPagination');
  if (existingPag) existingPag.remove();
  if (totalPages > 1) {
    const pag = document.createElement('div');
    pag.id = 'siswaPagination';
    pag.className = 'pagination';
    pag.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="siswaGoPage(${siswaPage-1})" ${siswaPage<=1?'disabled':''}>← Prev</button>
      <span class="text-muted">Hal ${siswaPage} / ${totalPages} &nbsp;(${total} santri)</span>
      <button class="btn btn-outline btn-sm" onclick="siswaGoPage(${siswaPage+1})" ${siswaPage>=totalPages?'disabled':''}>Next →</button>`;
    document.querySelector('#siswaTable').after(pag);
  }
}

function siswaGoPage(page) {
  siswaPage = page;
  renderSiswaTable(false);
}

// ── TUNGGAKAN ──
let tunggakanSuggIdx = -1;

const TUNGGAKAN_LIMIT = 50;
let tunggakanShowAll = false;   // direset saat halaman Tunggakan dibuka lagi
function renderTunggakan() {
  return withTagihanIndex(_renderTunggakan);
}
function _renderTunggakan() {
  const ss = appState.students;
  const withTk = ss.filter(s => totalTunggakan(s) > 0);
  const totalTk = withTk.reduce((a,s) => a + totalTunggakan(s), 0);
  const sppTk   = ss.reduce((a,s) => a + sppTunggakan(s), 0);
  const sppPrevTk = ss.reduce((a,s) => a + sppTunggakanPrev(s), 0);

  // Hitung tunggakan per item dari tagihan
  const itemStats = {};
  appState.tagihan.forEach(t => {
    const sisa = Math.max(0, t.nominal - t.paid_amount);
    if (sisa <= 0) return;
    if (!itemStats[t.item_id]) itemStats[t.item_id] = { name: t.item_name, total: 0, count: 0 };
    itemStats[t.item_id].total += sisa;
    itemStats[t.item_id].count += 1;
  });

  const el = document.getElementById('tunggakanStats');
  if (!el) return;

  const itemCards = Object.values(itemStats).map(it => `
    <div class="stat-card blue">
      <div class="stat-label">Tunggakan ${esc(it.name)}</div>
      <div class="stat-value fs-18">${rp(it.total)}</div>
      <div class="stat-sub">${it.count} santri</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-clip"/></svg></div>
    </div>`).join('');

  el.innerHTML = `
    <div class="stat-card red">
      <div class="stat-label">Total Tunggakan</div>
      <div class="stat-value fs-18">${rp(totalTk)}</div>
      <div class="stat-sub">${withTk.length} santri belum lunas</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-alert"/></svg></div>
    </div>
    <div class="stat-card gold">
      <div class="stat-label">Tunggakan SPP</div>
      <div class="stat-value fs-18">${rp(sppTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakan(s)>0).length} santri${sppDueMonthLabel() ? ' · s/d ' + esc(sppDueMonthLabel()) : ''}</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-cal"/></svg></div>
    </div>
    ${sppPrevTk > 0 ? `
    <div class="stat-card red">
      <div class="stat-label">Tunggakan SPP Th. Lalu</div>
      <div class="stat-value fs-18">${rp(sppPrevTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakanPrev(s)>0).length} santri</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-cal"/></svg></div>
    </div>` : ''}
    ${itemCards}
  `;
  document.getElementById('tunggakanDetail').innerHTML = '';
  // Daftar santri aktif yang menunggak, terbesar di atas — tidak perlu ketik nama dulu
  const daftar = ss.filter(isSantriAktif).map(s => ({ s, tk: totalTunggakan(s) }))
    .filter(x => x.tk > 0).sort((a, b) => b.tk - a.tk);
  // Ribuan baris sekaligus membuat browser lambat menggambar (≈0,8 dtk untuk
  // 3000 santri) — tampilkan yang terbesar dulu, sisanya lewat tombol.
  const tampil = tunggakanShowAll ? daftar : daftar.slice(0, TUNGGAKAN_LIMIT);
  const sisa = daftar.length - tampil.length;
  document.querySelector('#tunggakanTable tbody').innerHTML = (daftar.length
    ? tampil.map(({ s, tk }, i) => {
        const nSpp = sppUnpaidDueMonths(s).length;
        const n = escJs(s.nama);
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${esc(s.nama)}</strong></td>
          <td>${esc(kelasLabel(s))}</td>
          <td>${nSpp ? nSpp + ' bulan' : '<span class="text-muted">—</span>'}</td>
          <td class="text-right text-danger fw-700">${rp(tk)}</td>
          <td class="text-right nowrap">
            <button class="btn btn-outline btn-sm" onclick="selectTunggakanStudent('${n}');document.getElementById('tunggakanDetail').scrollIntoView({behavior:'smooth'})"><svg class="ic"><use href="#i-search"/></svg> Rincian</button>
            <button class="btn btn-primary btn-sm" onclick="quickInput('${n}')"><svg class="ic"><use href="#i-card"/></svg> Bayar</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td class="empty-row" colspan="6"><svg class="ic"><use href="#i-check"/></svg> Semua santri aktif sudah lunas</td></tr>')
    + (sisa > 0 ? `<tr><td class="empty-row" colspan="6"><button class="btn btn-outline btn-sm" onclick="tunggakanShowAll=true;renderTunggakan()">Tampilkan semua (${sisa} lagi)</button></td></tr>` : '');
  const inp = document.getElementById('searchTunggakan');
  if (inp) inp.value = '';
  hideTunggakanDropdown();
}

function onTunggakanSearch() {
  tunggakanSuggIdx = -1;
  const q = document.getElementById('searchTunggakan').value.trim().toLowerCase();
  const dd = document.getElementById('tunggakanDropdown');
  if (!q) { hideTunggakanDropdown(); return; }

  const matches = appState.students.filter(s =>
    s.nama.toLowerCase().includes(q)
  ).slice(0, 10);

  if (!matches.length) {
    dd.innerHTML = `<div class="p-14-16 fs-13 text-muted">Tidak ditemukan</div>`;
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = matches.map((s, i) => {
    const tk = totalTunggakan(s);
    const badge = tk > 0
      ? `<span class="fs-12 fw-700 text-danger bg-danger-pale p-2-8 rounded-20">Tunggak ${rp(tk)}</span>`
      : `<span class="fs-12 fw-700 text-primary-light bg-primary-pale p-2-8 rounded-20">✓ Lunas</span>`;
    return `<div class="tk-sugg-item sugg-row-tk" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectTunggakanStudent('${escJs(s.nama)}')"
      onmouseenter="hoverTunggakanItem(${i})"
     >
      <div>
        <div class="fw-600 fs-13-5">${esc(s.nama)}</div>
        <div class="fs-12 text-muted mt-1">${esc(kelasLabel(s))}</div>
      </div>
      ${badge}
    </div>`;
  }).join('');
  dd.style.display = 'block';
}

function hoverTunggakanItem(idx) {
  tunggakanSuggIdx = idx;
  document.querySelectorAll('.tk-sugg-item').forEach((el, i) => {
    el.style.background = i === idx ? 'var(--primary-pale)' : '';
  });
}

function onTunggakanKeydown(e) {
  const items = document.querySelectorAll('.tk-sugg-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    tunggakanSuggIdx = Math.min(tunggakanSuggIdx + 1, items.length - 1);
    items.forEach((el, i) => el.style.background = i === tunggakanSuggIdx ? 'var(--primary-pale)' : '');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    tunggakanSuggIdx = Math.max(tunggakanSuggIdx - 1, 0);
    items.forEach((el, i) => el.style.background = i === tunggakanSuggIdx ? 'var(--primary-pale)' : '');
  } else if (e.key === 'Enter' && tunggakanSuggIdx >= 0) {
    const nama = items[tunggakanSuggIdx].dataset.nama;
    selectTunggakanStudent(nama);
  } else if (e.key === 'Escape') {
    hideTunggakanDropdown();
  }
}

function hideTunggakanDropdown() {
  const dd = document.getElementById('tunggakanDropdown');
  if (dd) dd.style.display = 'none';
}

function selectTunggakanStudent(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('searchTunggakan').value = s.nama;
  hideTunggakanDropdown();
  renderTunggakanDetail(s);
}

function renderTunggakanDetail(s) {
  const nameSafe = escJs(s.nama);
  const headerBar = `
    <div class="flex items-start justify-between mb-20 flex-wrap gap-12">
      <div>
        <div class="fs-20 fw-800 text-primary">${esc(s.nama)}</div>
        <div class="fs-13 text-muted mt-3">${esc(kelasLabel(s))} &nbsp;•&nbsp; NISN: ${esc(s.nisn || '—')}</div>
      </div>
      <div class="flex gap-8 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="quickInput('${nameSafe}')"><svg class="ic"><use href="#i-card"/></svg> Bayar Sekarang</button>
        <button class="btn btn-outline btn-sm" onclick="openEditPembayaran('${nameSafe}')"><svg class="ic"><use href="#i-edit"/></svg> Edit Pembayaran</button>
        <button class="btn btn-outline btn-sm" onclick="openTunggakanLamaModal('${nameSafe}')"><svg class="ic"><use href="#i-cal"/></svg> Tunggakan TA Lama</button>
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nameSafe}')"><svg class="ic"><use href="#i-clip"/></svg> Detail Lengkap</button>
      </div>
    </div>`;

  const sppT   = sppTunggakan(s);
  const prevT  = sppTunggakanPrev(s);
  const prevList = sppTunggakanPrevList(s);
  const itemT  = itemsTunggakan(s);
  const totalT = sppT + prevT + itemT;

  // SPP bulan grid — tiga status: lunas, menunggak (sudah jatuh tempo),
  // dan belum jatuh tempo (tidak dihitung sebagai tunggakan).
  const bulanLunas = MONTHS.filter(m => (s.spp_paid_months||[]).includes(m));
  const bulanBelum = sppUnpaidDueMonths(s);
  const mulaiLabel = sppMulaiLabel(s);
  const monthGrid  = MONTHS.map(m => {
    const paid    = (s.spp_paid_months||[]).includes(m);
    const sebelum = !paid && isSppSebelumMasuk(s, m);
    const due     = !sebelum && isSppDueFor(s, m);
    const st     = paid ? 'is-paid' : due ? 'is-due' : 'is-future';
    const ang    = paid ? 0 : sppBulanDibayar(s, m);
    const ttl    = (paid ? 'Lunas'
      : sebelum ? `Sebelum masuk — tidak ditagih (SPP mulai ${mulaiLabel})`
      : due ? 'Belum bayar (sudah jatuh tempo)' : 'Belum jatuh tempo')
      + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
    return `<div title="${esc(ttl)}" class="mbox ${st}${ang > 0 ? ' is-angsur' : ''}${sebelum ? ' is-before' : ''}">${m}${ang > 0 ? `<div class="fs-12 fw-500">sisa ${rp(sppBulanSisa(s, m))}</div>` : ''}</div>`;
  }).join('');

  // Riwayat berlabel TA berjalan tidak ikut dihitung (lihat sppTunggakanPrevList)
  // — beri tahu admin supaya datanya dirapikan lewat editor "Tunggakan TA Lama",
  // bukan dibiarkan menggantung tanpa penjelasan.
  const taBentrok = (typeof sppHistTaBentrok === 'function') ? sppHistTaBentrok(s) : [];
  const bentrokNote = taBentrok.length ? `
    <div class="warn-box-spp">
      <svg class="ic"><use href="#i-alert"/></svg> <strong>Riwayat TA ${taBentrok.map(esc).join(', ')}</strong> berlabel tahun ajaran berjalan, jadi <strong>tidak dihitung</strong> sebagai tunggakan TA sebelumnya —
      tagihan tahun berjalan sudah dihitung lewat SPP di atas. Rapikan lewat tombol <strong><svg class="ic"><use href="#i-cal"/></svg> Tunggakan TA Lama</strong>.
    </div>` : '';

  // Rincian tunggakan SPP tiap tahun ajaran sebelumnya (bulan + nominal sisa)
  const prevGrids = bentrokNote + (prevList.length ? `
    <div class="mb-8 fw-700 fs-13 text-danger"><svg class="ic"><use href="#i-cal"/></svg> Tunggakan SPP Tahun Ajaran Sebelumnya</div>
    ${prevList.map(y => `
      <div class="bg-danger-pale rounded-12 p-12-14 mb-10">
        <div class="flex justify-between gap-8 flex-wrap mb-8">
          <div class="fs-13 fw-700">TA ${esc(y.ta)}${y.kelas ? ` · Kelas ${esc(y.kelas)}` : ''}</div>
          <div class="fs-13 fw-800 text-danger">${y.unpaid.length} bln · ${rp(y.amount)}</div>
        </div>
        <div class="flex flex-wrap gap-5">
          ${y.detail.map(d => `<span class="fs-12 fw-600 bg-white border-1-5-danger text-danger rounded-7 p-3-8">
            ${MONTH_FULL[d.m]} · ${rp(d.sisa)}${d.dibayar > 0 ? ' <span class="fw-400">(angsuran ' + rp(d.dibayar) + ')</span>' : ''}</span>`).join('')}
        </div>
      </div>`).join('')}` : '');

  // Tagihan item cards
  const tagihanSiswa = appState.tagihan.filter(t => t.nama === s.nama);
  const tagihanCards = tagihanSiswa.map(t => {
    const sisa = Math.max(0, t.nominal - t.paid_amount);
    const lunas = sisa <= 0;
    const pctPaid = pct(t.paid_amount, t.nominal);
    return `<div class="mb-8">
      <div class="fw-700 fs-13 text-primary mb-8"><svg class="ic"><use href="#i-clip"/></svg> ${esc(t.item_name)}</div>
      <div class="bg-bg rounded-12 p-14">
        <div class="flex justify-between mb-6 fs-13">
          <span>Tagihan</span><strong>${rp(t.nominal)}</strong>
        </div>
        <div class="flex justify-between mb-6 fs-13">
          <span>Dibayar</span><strong class="text-primary-light">${rp(t.paid_amount)}</strong>
        </div>
        <div class="flex justify-between mb-10 fs-13">
          <span>Sisa</span><strong class="${lunas?'text-primary-light':'text-danger'}">${lunas?'<svg class="ic"><use href="#i-check"/></svg> Lunas':rp(sisa)}</strong>
        </div>
        <div class="progress-wrap h-8">
          <div class="progress-bar ${pctPaid>=100?'green':'yellow'}" style="width:${pctPaid}%"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const totalBanner = totalT > 0
    ? `<div class="alert-danger">
        <div class="fw-800 fs-15 text-danger"><svg class="ic"><use href="#i-alert"/></svg> Total Tunggakan: ${rp(totalT)}</div>
        ${sppT > 0  ? `<div class="fs-13 mt-4">SPP: ${rp(sppT)} (${bulanBelum.length} bulan belum lunas${sppDueMonthLabel() ? ' s/d ' + sppDueMonthLabel() : ''})</div>` : ''}
        ${prevT > 0 ? `<div class="fs-13 mt-2">SPP tahun lalu: ${rp(prevT)} (${prevList.map(y => 'TA ' + esc(y.ta) + ': ' + y.unpaid.length + ' bln').join(', ')})</div>` : ''}
        ${itemT > 0 ? `<div class="fs-13 mt-2">Item lain: ${rp(itemT)}</div>` : ''}
      </div>`
    : `<div class="alert-ok">
        <div class="fw-800 fs-15 text-primary-light"><svg class="ic"><use href="#i-check"/></svg> Semua Pembayaran Lunas</div>
      </div>`;

  document.getElementById('tunggakanDetail').innerHTML = `
    <div class="card">
      ${headerBar}
      ${totalBanner}
      <div class="grid cols-3 gap-12 mb-20">
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">SPP / Bulan</div>
          <div class="fs-18 fw-800 text-primary">${rp(s.spp)}</div>
        </div>
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">Bulan Lunas</div>
          <div class="fs-18 fw-800 text-primary-light">${bulanLunas.length} <span class="fs-12 fw-500">/ 12</span></div>
        </div>
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">Item Tagihan</div>
          <div class="fs-18 fw-800 ${itemT>0?'text-danger':'text-primary-light'}">${tagihanSiswa.length}</div>
        </div>
      </div>
      <div class="mb-8 fw-700 fs-13 text-primary"><svg class="ic"><use href="#i-cal"/></svg> Status SPP per Bulan (TA berjalan)</div>
      <div class="month-grid-6-lg">${monthGrid}</div>
      <div class="fs-12 text-muted mb-20 lh-16">
        Tunggakan dihitung sampai bulan berjalan${sppDueMonthLabel() ? ' (<strong>' + esc(sppDueMonthLabel()) + '</strong>)' : ''} —
        bulan bergaris putus-putus belum jatuh tempo &amp; tidak dihitung menunggak.
      </div>
      ${prevGrids}
      ${tagihanCards}
    </div>`;
}

// Close tunggakan dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('tunggakanSearchWrap');
  if (wrap && !wrap.contains(e.target)) hideTunggakanDropdown();
});

function quickInput(nama) {
  showPage('input');
  setTimeout(() => {
    selectInputNama(nama);
  }, 100);
}

// ── ITEM MANAGEMENT ──
;// ══ js/tunggakan.js ══
// ── SiPay · Halaman Tunggakan ──
let editingItemIdx = -1;

function renderItemList() {
  const cont = document.getElementById('itemList');
  const KELAS_ALL = ['7','8','9','calon'];
  const kelasLabel = k => k === 'calon' ? 'Kls Calon' : 'Kelas ' + k;
  cont.innerHTML = appState.payItems.map((item,idx) => {
    const typeLabel = item.type==='bulanan'?'Bulanan (SPP)':item.type==='custom'?'Custom':'Tetap';
    // "Default" = item bawaan (bukan tambahan admin). Berbasis id agar tetap
    // benar walau urutan diubah (item custom ber-id 'custom_...').
    const isDefault = !String(item.id || '').startsWith('custom_');
    const itemKelas = item.kelas || [];

    if (editingItemIdx === idx) {
      return `<div class="bg-primary-pale rounded-12 p-14 mb-8 border-1-5-primary-light">
        <div class="fs-12 fw-700 text-primary mb-10"><svg class="ic"><use href="#i-edit"/></svg> Edit Item #${idx+1}</div>
        <div class="grid cols-2 gap-10">
          <div class="form-group">
            <label>Nama Item</label>
            <input type="text" id="ei_name" value="${esc(item.name)}">
          </div>
          <div class="form-group">
            <label>Nominal Default (Rp)</label>
            <input type="number" id="ei_amount" value="${item.amount||0}">
          </div>
          <div class="form-group">
            <label>Jenis</label>
            <select id="ei_type">
              <option value="tetap" ${item.type==='tetap'?'selected':''}>Tetap per Siswa</option>
              <option value="custom" ${item.type==='custom'?'selected':''}>Nominal Custom</option>
              <option value="bulanan" ${item.type==='bulanan'?'selected':''}>Bulanan (SPP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Aktif untuk Kelas</label>
            <div class="flex gap-10 mt-6">
              ${KELAS_ALL.map(k => `<label class="flex items-center gap-5 fs-13 fw-500 pointer">
                <input class="accent-primary w-15 h-15" type="checkbox" id="ei_kelas_${k}" value="${k}" ${(item.kelas||[]).includes(k)?'checked':''}>
                ${kelasLabel(k)}
              </label>`).join('')}
            </div>
          </div>
          <div class="form-group fg-actions">
            <button class="btn btn-primary btn-sm" onclick="saveEditItem(${idx})"><svg class="ic"><use href="#i-save"/></svg> Simpan</button>
            <button class="btn btn-outline btn-sm" onclick="cancelEditItem()">Batal</button>
          </div>
        </div>
      </div>`;
    }

    // Badge kelas
    const _klsLabel = k => k === 'calon' ? 'Kls Calon' : 'Kls ' + k;
    const kelasBadge = itemKelas.length
      ? itemKelas.map(k => `<span class="kls-tag${k==='calon'?' is-calon':''}">${_klsLabel(k)}</span>`).join(' ')
      : `<span class="kls-tag is-none">Tidak ada kelas</span>`;

    return `<div class="item-row" draggable="true" data-idx="${idx}"
      ondragstart="onItemDragStart(event, ${idx})" ondragover="onItemDragOver(event)"
      ondragleave="onItemDragLeave(event)" ondrop="onItemDrop(event, ${idx})" ondragend="onItemDragEnd(event)"
     >
      <span class="drag-handle" title="Seret untuk mengubah urutan">⠿</span>
      <label class="toggle"><input type="checkbox" ${item.active?'checked':''} onchange="toggleItem(${idx})"><span class="toggle-slider"></span></label>
      <div class="flex-1 minw-0">
        <div class="fw-600 fs-13-5">${esc(item.name)}</div>
        <div class="hint mt-2">${typeLabel} • ${rp(item.amount)}${isDefault?' • <span class="text-accent">Default</span>':''}</div>
        <div class="mt-5 flex gap-4 flex-wrap">${kelasBadge}</div>
      </div>
      <span class="badge ${item.active?'badge-green':'badge-gray'} nowrap">${item.active?'Aktif':'Nonaktif'}</span>
      <button class="btn btn-outline btn-sm" onclick="startEditItem(${idx})" title="Edit item"><svg class="ic"><use href="#i-edit"/></svg> Edit</button>
      ${BAKU_ITEMS.includes(item.id)
        ? `<span class="lock-ico" title="Item baku — tidak bisa dihapus, hanya bisa diedit"><svg class="ic"><use href="#i-lock"/></svg></span>`
        : `<button class="btn btn-danger btn-sm act-del" onclick="confirmRemoveItem(${idx})" title="Hapus item"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>`}
    </div>`;
  }).join('');
}

// ── Drag & drop: ubah urutan item bayar ──
// Urutan array appState.payItems = urutan tampil (di sini & di form Input).
let _dragItemFrom = -1;
function onItemDragStart(e, idx) {
  _dragItemFrom = idx;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  e.currentTarget.style.opacity = '0.4';
}
function onItemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.style.background = 'var(--primary-pale)';
}
function onItemDragLeave(e) {
  e.currentTarget.style.background = '';
}
function onItemDragEnd() {
  document.querySelectorAll('#itemList > div').forEach(d => { d.style.background = ''; d.style.opacity = ''; });
  _dragItemFrom = -1;
}
async function onItemDrop(e, idx) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  const from = _dragItemFrom;
  _dragItemFrom = -1;
  const arr = appState.payItems;
  if (from < 0 || from === idx || from >= arr.length || idx >= arr.length) { renderItemList(); return; }
  const [moved] = arr.splice(from, 1);
  arr.splice(from < idx ? idx - 1 : idx, 0, moved); // sisip sebelum item target
  renderItemList();
  showSyncIndicator('💾 Menyimpan urutan...');
  await saveSettings();
  showSyncIndicator('✅ Urutan disimpan', 1500);
}

function startEditItem(idx) { editingItemIdx = idx; renderItemList(); }
function cancelEditItem() { editingItemIdx = -1; renderItemList(); }
async function saveEditItem(idx) {
  const name = document.getElementById('ei_name').value.trim();
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('ei_kelas_'+k)?.checked);
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  const it = appState.payItems[idx];
  const newAmount = Number(document.getElementById('ei_amount').value) || 0;
  const newType   = document.getElementById('ei_type').value;
  const amountChanged = it.amount !== newAmount;
  it.name   = name;
  it.amount = newAmount;
  it.type   = newType;
  it.kelas  = kelas;
  editingItemIdx = -1;
  saveSettings();
  // Item tetap: sinkronkan nominal baru ke tagihan santri yang sudah ada
  // (paid_amount tiap santri dipertahankan) agar sisa tagihan ikut terbarui.
  // 'pangkal' dikecualikan: nominalnya per-siswa (diatur di form Data Siswa),
  // jadi mengubah "default" di sini tak menimpa nilai per-siswa yang sudah ada.
  if (newType === 'tetap' && amountChanged && !PER_STUDENT_ITEMS.includes(it.id)) {
    showSyncIndicator('⏳ Menyinkronkan nominal tagihan...');
    try {
      const n = await updateTagihanNominalByItem(it.id, newAmount);
      showSyncIndicator(n ? `✅ ${n} tagihan santri diperbarui` : '✅ Tersimpan', 2000);
    } catch(e) { showSyncIndicator('⚠️ Gagal perbarui tagihan', 3000); }
  }
  renderItemList();
  if (typeof renderTunggakan === 'function') renderTunggakan();
  if (typeof renderDashboard === 'function') renderDashboard();
  toast('✅ Item berhasil diperbarui!');
}

async function toggleItem(idx) {
  const item = appState.payItems[idx];
  const willBeActive = !item.active;

  if (willBeActive) {
    item.active = true;
    saveSettings(); renderItemList();
    if (item.type === 'tetap') {
      showSyncIndicator('⏳ Membuat tagihan...');
      try {
        const n = await createTagihanForItem(item);
        showSyncIndicator('✅ Tagihan dibuat', 2000);
        toast(`✅ Item diaktifkan${n > 0 ? ' — ' + n + ' tagihan santri dibuat' : ''}`);
        renderTunggakan(); renderDashboard();
      } catch(e) {
        showSyncIndicator('⚠️ Gagal buat tagihan', 3000);
        toast('✅ Item diaktifkan (tagihan gagal: ' + e.message + ')');
      }
    } else {
      toast('✅ Item diaktifkan');
    }
  } else {
    _deactivatingIdx = idx;
    document.getElementById('deactivateItemName').textContent = item.name;
    const hasTagihan = appState.tagihan.some(t => t.item_id === item.id);
    document.getElementById('deactivateTagihanWarn').style.display = hasTagihan ? 'block' : 'none';
    document.getElementById('deactivateModal').classList.add('open');
  }
}

let _deactivatingIdx = -1;

function cancelDeactivate() {
  document.getElementById('deactivateModal').classList.remove('open');
  _deactivatingIdx = -1;
  renderItemList();
}

async function confirmDeactivateKeep() {
  if (_deactivatingIdx < 0) return;
  appState.payItems[_deactivatingIdx].active = false;
  saveSettings(); renderItemList(); renderTunggakan(); renderDashboard();
  document.getElementById('deactivateModal').classList.remove('open');
  toast('⭕ Item dinonaktifkan — record tagihan tetap tersimpan');
  _deactivatingIdx = -1;
}

async function confirmDeactivateDelete() {
  if (_deactivatingIdx < 0) return;
  const item = appState.payItems[_deactivatingIdx];
  item.active = false;
  document.getElementById('deactivateModal').classList.remove('open');
  showSyncIndicator('⏳ Menghapus tagihan...');
  try {
    await deleteTagihanByItemId(item.id);
    showSyncIndicator('✅ Tagihan dihapus', 2000);
  } catch(e) { showSyncIndicator('⚠️ Gagal hapus tagihan', 3000); }
  saveSettings(); renderItemList(); renderTunggakan(); renderDashboard();
  toast('🗑️ Item dinonaktifkan & semua tagihan dihapus');
  _deactivatingIdx = -1;
}
function confirmRemoveItem(idx) {
  const item = appState.payItems[idx];
  if (BAKU_ITEMS.includes(item.id)) {
    toast('🔒 Item baku (SPP, Uang Pangkal, Uang Pendaftaran) tidak bisa dihapus — hanya bisa diedit.');
    return;
  }
  const name = item.name;
  document.getElementById('deleteMsg').textContent = 'Hapus item pembayaran "' + name + '"? Item ini tidak akan tersedia lagi di form input.';
  document.getElementById('deleteConfirmBtn').onclick = function() {
    appState.payItems.splice(idx,1);
    if (editingItemIdx === idx) editingItemIdx = -1;
    saveSettings();
    document.getElementById('deleteModal').classList.remove('open');
    renderItemList();
    toast('🗑️ Item "' + name + '" dihapus');
  };
  document.getElementById('deleteModal').classList.add('open');
}
function addItem() {
  const name = document.getElementById('newItemName').value.trim();
  const amount = Number(document.getElementById('newItemAmount').value)||0;
  const type = document.getElementById('newItemType').value;
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('newItemKelas'+k)?.checked);
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  appState.payItems.push({ id: 'custom_'+Date.now(), name, amount, type, active: true, kelas });
  saveSettings(); renderItemList();
  document.getElementById('newItemName').value='';
  document.getElementById('newItemAmount').value='';
  ['7','8','9'].forEach(k => { const el = document.getElementById('newItemKelas'+k); if(el) el.checked = true; });
  const elCalon = document.getElementById('newItemKelasCalon'); if(elCalon) elCalon.checked = false;
  toast('✅ Item berhasil ditambahkan!');
}

// ── DETAIL MODAL ──
;// ══ js/items.js ══
// ── SiPay · Item Management & Detail Modal ──
function showDetail(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('modalTitle').textContent = s.nama;
  const sppT = sppTunggakan(s), prevT = sppTunggakanPrev(s), itemT = itemsTunggakan(s);
  const totalT = sppT + prevT + itemT;
  const prevList = sppTunggakanPrevList(s);
  // Agregat tagihan item (tetap) untuk ringkasan
  const tagT       = appState.tagihan.filter(t => t.nama === s.nama);
  const tagNominal = tagT.reduce((a, t) => a + (t.nominal || 0), 0);
  const tagPaid    = tagT.reduce((a, t) => a + (t.paid_amount || 0), 0);

  // Cek nama mirip (fuzzy duplicate warning)
  const dupes = detectDuplicateNames().filter(d => d.a === s.nama || d.b === s.nama);

  const otherTAHtml = ''

  // Warning nama mirip
  const dupesHtml = dupes.length ? `
    <div class="note-yellow-sm">
      <svg class="ic"><use href="#i-alert"/></svg> Nama mirip ditemukan: ${dupes.map(d => `<strong>${esc(d.a === s.nama ? d.b : d.a)}</strong> (${d.score}%)`).join(', ')}
      — Periksa apakah ini siswa yang sama.
    </div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div class="grid cols-2 gap-8 mb-16">
      <div><div class="hint">Kelas</div><div class="fw-700">${esc(s.kelas)}</div></div>
      <div><div class="hint">NISN</div><div class="fw-700">${esc(s.nisn||'—')}</div></div>
      <div><div class="hint">SPP/bulan</div><div class="fw-700">${rp(s.spp)}</div></div>
      <div><div class="hint">Item Tagihan</div><div class="fw-700">${rp(tagPaid)} / ${rp(tagNominal)}</div></div>
    </div>
    <div class="mb-16">
      <div class="fw-700 fs-13 mb-8 text-primary">Status SPP TA Ini</div>
      <div class="month-grid">${MONTHS.map(m => {
        const paid    = (s.spp_paid_months||[]).includes(m);
        const sebelum = !paid && isSppSebelumMasuk(s, m);
        const due     = !sebelum && isSppDueFor(s, m);
        const cls  = paid ? 'paid' : sebelum ? 'upcoming before' : due ? 'due' : 'upcoming';
        const ang  = paid ? 0 : sppBulanDibayar(s, m);
        const ttl  = (paid ? 'Lunas'
          : sebelum ? `Sebelum masuk — tidak ditagih (SPP mulai ${esc(sppMulaiLabel(s))})`
          : due ? 'Belum bayar (jatuh tempo)' : 'Belum jatuh tempo')
          + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
        return `<div class="month-btn ${cls}${ang > 0 ? ' is-angsur' : ''}" title="${ttl}">${m}${ang > 0 ? `<div class="fs-12 fw-500">sisa ${rp(sppBulanSisa(s, m))}</div>` : ''}</div>`;
      }).join('')}</div>
      <div class="fs-12 text-muted mt-6">
        Tunggakan SPP dihitung ${sppMulaiLabel(s) ? 'mulai <strong>' + esc(sppMulaiLabel(s)) + '</strong> (bulan santri masuk) ' : ''}s/d bulan berjalan${sppDueMonthLabel() ? ' (' + esc(sppDueMonthLabel()) + ')' : ''}.
      </div>
    </div>
    <div class="sum-box ${totalT>0?'is-due':'is-ok'}">
      ${sppT > 0 ? `<div class="mb-4"><strong>Tunggakan SPP:</strong> ${rp(sppT)}</div>` : ''}
      ${prevT > 0 ? `<div class="mb-4"><strong>Tunggakan SPP Tahun Lalu:</strong> ${rp(prevT)}
        <span class="hint">(${prevList.map(y => 'TA ' + esc(y.ta) + ': ' + y.unpaid.length + ' bln').join(', ')})</span></div>` : ''}
      ${itemT > 0 ? `<div class="mb-4"><strong>Tunggakan Item Tagihan:</strong> ${rp(itemT)}</div>` : ''}
      ${totalT===0 ? '<div class="text-primary-light fw-700">✓ Semua pembayaran lunas!</div>' : `<div class="fw-700 mt-4">Total: ${rp(totalT)}</div>`}
    </div>
    ${otherTAHtml}
    ${dupesHtml}
    <div class="mt-16 flex gap-8">
      <button class="btn btn-primary" onclick="closeModal();quickInput('${escJs(s.nama)}')"><svg class="ic"><use href="#i-card"/></svg> Bayar Sekarang</button>
      <button class="btn btn-outline" onclick="closeModal();showCetakForStudent('${escJs(s.nama)}')"><svg class="ic"><use href="#i-file"/></svg> Cetak Surat</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ── CETAK / PDF ──
;// ══ js/cetak.js ══
// ── SiPay · Cetak & PDF ──
function renderCetakPage() {
  const sel = document.getElementById('cetakNama');
  sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s=>`<option value="${esc(s.nama)}">${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('');
  document.getElementById('cetakNamaSearch').value = sel.value;
  document.getElementById('cetakTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('cetakTanggalTotal').value = new Date().toISOString().split('T')[0];
}

// ── Pencarian nama (gaya sama dengan Input Pembayaran & Tunggakan) ──
let cetakSuggIdx = -1;
function onCetakNamaSearch() {
  cetakSuggIdx = -1;
  const q = document.getElementById('cetakNamaSearch').value.trim().toLowerCase();
  const dd = document.getElementById('cetakNamaDropdown');
  const matches = appState.students.filter(s => s.nama.toLowerCase().includes(q)).slice(0, 10);
  dd.innerHTML = matches.length
    ? matches.map(s => `<div class="nama-sugg" data-nama="${esc(s.nama)}" onmousedown="pickCetakNama(this.dataset.nama)">
        <b>${esc(s.nama)}</b><span>${esc(kelasLabel(s))}</span></div>`).join('')
    : '<div class="nama-sugg-empty">Tidak ditemukan</div>';
  dd.style.display = 'block';
}
function onCetakNamaKeydown(e) {
  const items = [...document.querySelectorAll('#cetakNamaDropdown .nama-sugg')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    cetakSuggIdx = Math.max(0, Math.min(items.length - 1, cetakSuggIdx + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((el, i) => el.classList.toggle('active', i === cetakSuggIdx));
    items[cetakSuggIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && items[cetakSuggIdx]) {
    pickCetakNama(items[cetakSuggIdx].dataset.nama);
  } else if (e.key === 'Escape') {
    document.getElementById('cetakNamaDropdown').style.display = 'none';
  }
}
function pickCetakNama(nama) {
  document.getElementById('cetakNama').value = nama;
  document.getElementById('cetakNamaSearch').value = nama;
  document.getElementById('cetakNamaDropdown').style.display = 'none';
  onCetakStudentSelect();
}
document.addEventListener('click', e => {
  const wrap = document.getElementById('cetakSearchWrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('cetakNamaDropdown').style.display = 'none';
});

function showCetakForStudent(nama) {
  showPage('cetak');
  setTimeout(() => {
    pickCetakNama(nama);
  }, 100);
}

function onCetakStudentSelect() {
  const nama = document.getElementById('cetakNama').value;
  const s = getStudent(nama);
  document.getElementById('cetakKelas').textContent = s ? kelasLabel(s) : '—';
  document.getElementById('cetakNISN').textContent = s ? (s.nisn||'—') : '—';
}

function switchCetakTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('cetak-individu').style.display = tab==='individu'?'block':'none';
  document.getElementById('cetak-total').style.display    = tab==='total'?'block':'none';
  document.getElementById('cetak-export').style.display   = tab==='export'?'block':'none';
}

// ══════════════════════════════════════════
// EXPORT / BACKUP KE EXCEL
// ══════════════════════════════════════════

function downloadXlsx(wb, filename) {
  XLSX.writeFile(wb, filename);
}

// Helper: siswa → baris excel
function siswaToRow(s) {
  const sppBayar = (s.spp_paid_months||[]).length;
  const tunggak = totalTunggakan(s);
  const bulanLunas = MONTHS.filter(m => (s.spp_paid_months||[]).includes(m)).map(m => MONTH_FULL[m]).join(', ');
  const angsur = (s.spp_angsur && typeof s.spp_angsur === 'object') ? s.spp_angsur : {};
  const bulanAngsur = MONTHS.filter(m => Number(angsur[m]) > 0 && !(s.spp_paid_months||[]).includes(m))
    .map(m => MONTH_FULL[m] + ' ' + Number(angsur[m]).toLocaleString('id-ID')).join(', ');
  const tkItems = itemsTunggakan(s);
  const prevList = sppTunggakanPrevList(s);
  return {
    'Nama': s.nama,
    'Kelas': s.kelas,
    'NISN': s.nisn || '',
    'SPP/Bulan': s.spp || 0,
    'Bulan SPP Lunas': sppBayar,
    'Bulan Lunas (detail)': bulanLunas,
    'Angsuran SPP (belum lunas)': bulanAngsur,
    'Tunggakan SPP': sppTunggakan(s),
    'Tunggakan SPP TA Lalu': sppTunggakanPrev(s),
    'Rincian TA Lalu': prevList.map(y => 'TA ' + y.ta + ': ' + y.unpaid.length + ' bln').join('; '),
    'Tunggakan Item': tkItems,
    'Total Tunggakan': tunggak,
    'Status': tunggak > 0 ? 'Belum Lunas' : 'Lunas',
  };
}

async function exportSiswaExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = appState.students.map(s => siswaToRow(s));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [24,6,12,10,8,32,24,14,18,28,14,12,10].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');
      const tgl = new Date().toISOString().slice(0,10);
      downloadXlsx(wb, `SiPay_DataSantri_${tgl}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportTransaksiExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = await sb('transactions?select=*&order=created_at.desc');
      const data = rows.map(r => ({
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : r.time || '—',
        'Jam': r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '—',
        'Nama': r.nama,
        'Kelas': r.kelas,
        'Jenis Bayar': r.jenis,
        'Nominal': r.nominal || 0,
        'Catatan': r.catatan || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [12,6,24,6,32,12,24].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
      downloadXlsx(wb, `SiPay_Transaksi_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportKuitansiExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = await sb('kuitansi?select=*&order=created_at.desc');
      const data = rows.map(r => ({
        'No. Kuitansi': r.no_kuitansi || '—',
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '—',
        'Nama': r.nama,
        'Kelas': r.kelas,
        'NISN': r.nisn || '',
        'Rincian': Array.isArray(r.items) ? r.items.map(i => i.name).join(', ') : '—',
        'Total': r.total || 0,
        'Catatan': r.catatan || '',
        'Dicetak': r.dicetak ? 'Ya' : 'Belum',
        'Jenis': r.is_koreksi ? 'Koreksi' : 'Normal',
        'Ref Koreksi': r.ref_no_kuitansi || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [16,12,24,6,12,36,12,24,8,8,16].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Kuitansi');
      downloadXlsx(wb, `SiPay_Kuitansi_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportBackupLengkap() {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan backup lengkap...');
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Siswa
      const allSiswa = await sb('students?select=*&order=nama');
      const wsSiswa = XLSX.utils.json_to_sheet(
        allSiswa.map(s => siswaToRow({
          ...s,
          spp_paid_months: Array.isArray(s.spp_paid_months) ? s.spp_paid_months : [],
        }))
      );
      wsSiswa['!cols'] = [24,6,12,10,8,32,24,14,18,28,14,12,10].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsSiswa, 'Data Santri');

      // Sheet 2: Transaksi
      const allTxn = await sb('transactions?select=*&order=created_at.desc');
      const wsTxn = XLSX.utils.json_to_sheet(allTxn.map(r => ({
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : r.time || '—',
        'Jam': r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '—',
        'Nama': r.nama, 'Kelas': r.kelas,
        'Jenis Bayar': r.jenis, 'Nominal': r.nominal || 0, 'Catatan': r.catatan || '',
      })));
      wsTxn['!cols'] = [12,6,24,6,32,12,24].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsTxn, 'Transaksi');

      // Sheet 3: Kuitansi
      const allKwt = await sb('kuitansi?select=*&order=created_at.desc');
      const wsKwt = XLSX.utils.json_to_sheet(allKwt.map(r => ({
        'No. Kuitansi': r.no_kuitansi || '—',
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '—',
        'Nama': r.nama, 'Kelas': r.kelas, 'NISN': r.nisn || '',
        'Rincian': Array.isArray(r.items) ? r.items.map(i=>i.name).join(', ') : '—',
        'Total': r.total || 0, 'Catatan': r.catatan || '',
        'Dicetak': r.dicetak ? 'Ya' : 'Belum',
        'Jenis': r.is_koreksi ? 'Koreksi' : 'Normal',
      })));
      wsKwt['!cols'] = [16,12,10,24,6,12,36,12,24,8,8].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsKwt, 'Kuitansi');

      // Sheet 4: Tunggakan ringkasan
      const wsTk = XLSX.utils.json_to_sheet(
        appState.students.map(s => ({
          'Nama': s.nama, 'Kelas': s.kelas, 'NISN': s.nisn || '',
          'Tunggakan SPP': sppTunggakan(s),
          'Tunggakan SPP TA Lalu': sppTunggakanPrev(s),
          'Rincian TA Lalu': sppTunggakanPrevList(s).map(y => 'TA ' + y.ta + ': ' + y.unpaid.length + ' bln').join('; '),
          'Tunggakan Item': itemsTunggakan(s),
          'Total Tunggakan': totalTunggakan(s),
          'Status': totalTunggakan(s) > 0 ? 'Belum Lunas' : 'Lunas',
        }))
      );
      wsTk['!cols'] = [24,6,12,14,18,28,14,14,10].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsTk, 'Tunggakan');

      const tgl = new Date().toISOString().slice(0,10);
      downloadXlsx(wb, `SiPay_Backup_Lengkap_${tgl}.xlsx`);
      toast('✅ Backup lengkap berhasil didownload!');
    } catch(e) { toast('⚠️ Gagal backup: ' + e.message); }
  });
}

// Gaya isi surat & rekap — dipakai preview di aplikasi dan jendela cetak
// (jendela cetak tidak memuat main.css). Diawali .pdf-preview agar menang
// atas gaya tabel umum aplikasi.
const SURAT_CSS = `
.pdf-preview .s-logo-img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
.pdf-preview .s-to { margin-bottom:12px; line-height:2; font-size:11pt; }
.pdf-preview .s-para { text-align:justify; line-height:1.8; margin-bottom:12px; font-size:11pt; }
.pdf-preview .s-para-end { margin:10px 0; }
.pdf-preview .s-mb10 { margin-bottom:10px; }
.pdf-preview .s-w30 { width:30px; }
.pdf-preview .s-w110 { width:110px; }
.pdf-preview .s-c { text-align:center; }
.pdf-preview .s-r { text-align:right; }
.pdf-preview .s-b { font-weight:bold; }
.pdf-preview .s-big { font-size:13pt; }
.pdf-preview .s-red { color:#c0392b; }
.pdf-preview .s-due { color:#c0392b; font-weight:bold; }
.pdf-preview .s-small { font-size:9pt; }
.pdf-preview .s-normal { font-weight:normal; }
.pdf-preview .s-ket { font-size:10pt; }
.pdf-preview .s-total-row { background:#f0f0f0; }
.pdf-preview .s-row-due { background:#fff5f5; }
.pdf-preview .s-note { margin:10px 0; padding:8px 12px; border-radius:4px; font-size:10.5pt; }
.pdf-preview .s-note-warn { background:#fff3cd; border-left:4px solid #c8a04a; }
.pdf-preview .s-note-ok { background:#d4edda; border-left:4px solid #1e7c45; }
`;

function buildSuratHTML(s, tgl) {
  const sppT  = sppTunggakan(s);
  const prevList = sppTunggakanPrevList(s);   // tunggakan SPP TA sebelumnya
  const prevT    = sppTunggakanPrev(s);
  const totalT = totalTunggakan(s);
  const tglFmt = new Date(tgl).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  // Baris SPP tahun berjalan hanya untuk santri yang masih menempuh TA aktif.
  // Santri LULUS sudah tidak punya kewajiban SPP berjalan (sppTunggakan = 0) —
  // kewajibannya pindah ke spp_history dan tampil sebagai baris TA sebelumnya.
  const sppAktif = s.spp > 0 && s.status_kelulusan !== 'lulus';
  // Surat tagihan hanya memuat kewajiban yang SUDAH jatuh tempo (Juli s/d
  // bulan berjalan) supaya angkanya sama dengan tunggakan di aplikasi.
  const bulanBelum = sppAktif ? sppUnpaidDueMonths(s) : [];
  // Santri yang masuk di tengah TA hanya ditagih sejak bulan masuknya.
  const bulanDue   = sppAktif ? sppDueMonthsFor(s) : [];
  const mulaiLabel = sppAktif ? sppMulaiLabel(s) : '';
  const bulanLunasDue = bulanDue.filter(m => (s.spp_paid_months||[]).includes(m));
  // Bulan belum jatuh tempo yang sudah diangsur sebagian — hanya keterangan,
  // tidak masuk kolom Tagihan/Terbayar (keduanya hanya s/d bulan berjalan).
  const angsurDimuka  = sppAktif ? MONTHS.filter(m => !bulanDue.includes(m)
    && !(s.spp_paid_months||[]).includes(m) && !isSppSebelumMasuk(s, m) && sppBulanDibayar(s, m) > 0) : [];
  const bulanDimuka   = (s.spp_paid_months||[])
    .filter(m => !bulanDue.includes(m) && !isSppSebelumMasuk(s, m));
  const sppTagihanDue = (s.spp || 0) * bulanDue.length;
  // Angsuran (bayar sebagian) bulan yang belum lunas ikut dihitung terbayar.
  const sppTerbayarDue = (s.spp || 0) * bulanLunasDue.length + sppAngsurTotal(s, bulanBelum);
  const P = getProfil();
  const siswaTagihan = appState.tagihan.filter(t => t.nama === s.nama);
  let no = 0;
  return `
  <div class="pdf-preview" id="suratPreview">
    <div class="kop-surat">
      <div class="kop-logo">${getLogo() ? `<img class="s-logo-img" src="${safeUrl(getLogo())}">` : '🕌'}</div>
      <div class="kop-text">
        <h2>${esc(P.nama||'MADRASAH TERPADU')}</h2>
        <p>${esc(P.alamat||'')}${P.kota?', '+esc(P.kota):''}${P.provinsi?', '+esc(P.provinsi):''}</p>
        <p>${P.telp?'Telp. '+esc(P.telp):''} ${P.email?'| Email: '+esc(P.email):''} ${P.nsm?'| NSM: '+esc(P.nsm):''}</p>
      </div>
    </div>
    <div class="surat-body">
      <h3>SURAT PEMBERITAHUAN PEMBAYARAN</h3>
      <p class="s-to">
        Kepada Yth.<br>
        <strong>Orang Tua / Wali Santri</strong><br>
        Nama Santri &nbsp;: <strong>${esc(s.nama)}</strong><br>
        Kelas &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${esc(s.kelas)}<br>
        NISN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${esc(s.nisn||'—')}
      </p>
      <p class="s-para">
        Dengan hormat, bersama surat ini kami sampaikan informasi pembayaran santri yang bersangkutan untuk Tahun Ajaran Berjalan${sppDueMonthLabel() ? ' (SPP dihitung sampai bulan ' + esc(sppDueMonthLabel()) + ')' : ''}${prevList.length ? ', termasuk tunggakan SPP Tahun Ajaran sebelumnya (' + prevList.map(y => esc(y.ta)).join(', ') + ') yang belum dilunasi,' : ''} sebagaimana tercantum di bawah ini:
      </p>
      <table class="data-table-pdf">
        <thead><tr><th class="s-w30">No</th><th>Jenis Pembayaran</th><th>Keterangan</th><th class="s-w110">Tagihan (Rp)</th><th class="s-w110">Terbayar (Rp)</th><th class="s-w110">Sisa (Rp)</th></tr></thead>
        <tbody>
          ${prevList.map(y => `<tr>
            <td class="s-c">${++no}</td>
            <td>Tunggakan SPP T.A. ${esc(y.ta)}${y.kelas ? ` <span class="s-small">(Kelas ${esc(y.kelas)})</span>` : ''}</td>
            <td class="s-ket">${y.bulanLunas} dari ${y.bulanTagih} bulan lunas;<br>Belum: ${y.unpaid.map(m=>MONTH_FULL[m]).join(', ')}</td>
            <td class="s-r">${y.tagihan.toLocaleString('id-ID')}</td>
            <td class="s-r">${y.dibayar.toLocaleString('id-ID')}</td>
            <td class="s-r s-due">${y.amount.toLocaleString('id-ID')}</td>
          </tr>`).join('')}
          ${sppAktif ? `<tr>
            <td class="s-c">${++no}</td>
            <td>SPP Bulanan <span class="s-small">(${mulaiLabel ? 'mulai ' + esc(mulaiLabel) + ' ' : ''}s/d ${esc(sppDueMonthLabel() || '—')})</span></td>
            <td class="s-ket">${bulanLunasDue.length} dari ${bulanDue.length} bulan lunas${bulanBelum.length>0?';<br>Belum: '+bulanBelum.map(m=>MONTH_FULL[m]+(sppBulanDibayar(s,m)>0?' (sisa '+sppBulanSisa(s,m).toLocaleString('id-ID')+')':'')).join(', '):''}${bulanDimuka.length>0?';<br>Dibayar di muka: '+bulanDimuka.map(m=>MONTH_FULL[m]).join(', '):''}${angsurDimuka.length>0?';<br>Diangsur di muka: '+angsurDimuka.map(m=>MONTH_FULL[m]+' '+sppBulanDibayar(s,m).toLocaleString('id-ID')+' (sisa '+sppBulanSisa(s,m).toLocaleString('id-ID')+')').join(', '):''}</td>
            <td class="s-r">${sppTagihanDue.toLocaleString('id-ID')}</td>
            <td class="s-r">${sppTerbayarDue.toLocaleString('id-ID')}</td>
            <td class="s-r${sppT>0?' s-due':''}">${sppT.toLocaleString('id-ID')}</td>
          </tr>` : ''}
          ${siswaTagihan.map(t => {
            const sisa = Math.max(0, t.nominal - t.paid_amount);
            return `<tr>
              <td class="s-c">${++no}</td>
              <td>${esc(t.item_name)}</td>
              <td class="s-ket">Terbayar ${t.paid_amount.toLocaleString('id-ID')}</td>
              <td class="s-r">${t.nominal.toLocaleString('id-ID')}</td>
              <td class="s-r">${t.paid_amount.toLocaleString('id-ID')}</td>
              <td class="s-r${sisa>0?' s-due':''}">${sisa.toLocaleString('id-ID')}</td>
            </tr>`;
          }).join('')}
          <tr class="s-total-row">
            <td colspan="3" class="s-r s-b">TOTAL TUNGGAKAN</td>
            <td colspan="3" class="s-r s-b s-big${totalT>0?' s-red':''}">${totalT.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>
      ${totalT > 0 ? `<p class="s-note s-note-warn">
        <strong>Terbilang:</strong> <em>${terbilangFull(totalT)}</em></p>`
      : `<p class="s-note s-note-ok"><strong>✓ Alhamdulillah, semua pembayaran telah lunas!</strong></p>`}
      <p class="s-para s-para-end">Demikian surat pemberitahuan ini kami sampaikan. Apabila pembayaran telah dilakukan, mohon untuk mengabaikan surat ini. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.</p>
      <div class="ttd-section">
        <div class="ttd-box">
          <p>Mengetahui,<br>Kepala Madrasah</p>
          <div class="ttd-space"></div>
          <p><strong>${esc(P.kepsek||'__________________')}</strong>${P.kepsek_nip?'<br><small>'+esc(P.kepsek_nip)+'</small>':''}</p>
        </div>
        <div class="ttd-box">
          <p>${esc(P.kota||'Tarakan')}, ${tglFmt}<br>Bendahara</p>
          <div class="ttd-space"></div>
          <p><strong>${esc(P.bendahara||'__________________')}</strong>${P.bendahara_nip?'<br><small>'+esc(P.bendahara_nip)+'</small>':''}</p>
        </div>
      </div>
    </div>
  </div>`;
}

function previewPDF() {
  const nama = document.getElementById('cetakNama').value;
  const tgl  = document.getElementById('cetakTanggal').value;
  if (!nama) { toast('⚠️ Pilih nama santri!'); return; }
  const s = getStudent(nama);
  document.getElementById('pdfPreviewArea').innerHTML =
    `<style>${SURAT_CSS}</style><div class="pdf-preview-wrap">${buildSuratHTML(s, tgl)}</div>`;
}

function generatePDFIndividu() {
  const nama = document.getElementById('cetakNama').value;
  const tgl  = document.getElementById('cetakTanggal').value;
  if (!nama) { toast('⚠️ Pilih nama santri!'); return; }
  const s = getStudent(nama);
  printHTML(buildSuratHTML(s, tgl), `Surat_Tagihan_${nama.replace(/ /g,'_')}`);
}

function previewPDFTotal() {
  const kelasFil = document.getElementById('cetakKelasFilter').value;
  const tgl = document.getElementById('cetakTanggalTotal').value;
  document.getElementById('pdfPreviewTotal').innerHTML =
    `<style>${SURAT_CSS}</style><div class="pdf-preview-wrap">${buildRekapTotalHTML(kelasFil, tgl)}</div>`;
}

function generatePDFTotal() {
  const kelasFil = document.getElementById('cetakKelasFilter').value;
  const tgl = document.getElementById('cetakTanggalTotal').value;
  printHTML(buildRekapTotalHTML(kelasFil, tgl), `Rekap_Pembayaran${kelasFil?'_Kelas'+kelasFil:''}`);
}

// ── Core print / save-as-PDF ──
function printHTML(bodyHTML, filename) {
  const P = getProfil();
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { toast('⚠️ Popup diblokir browser. Izinkan popup lalu coba lagi.'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${esc(filename)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: 'Times New Roman', Times, serif; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    .pdf-preview {
      width: 210mm; min-height: 297mm;
      padding: 20mm 20mm 20mm 25mm;
      margin: 0 auto;
      font-size: 12pt; color: #000;
      box-sizing: border-box;
    }
    .kop-surat { display: flex; align-items: center; gap: 14px; border-bottom: 3px double #000; padding-bottom: 10px; margin-bottom: 14px; }
    .kop-logo { width: 70px; height: 70px; border-radius: 50%; background: #1e5631; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; overflow: hidden; }
    .kop-logo img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .kop-text { flex: 1; text-align: center; }
    .kop-text h2 { font-size: 16pt; font-weight: 700; margin: 0 0 3px; }
    .kop-text p { font-size: 10pt; color: #333; line-height: 1.5; }
    .surat-body { margin-top: 12px; }
    .surat-body h3 { text-align: center; font-size: 13pt; font-weight: 700; text-decoration: underline; margin: 14px 0 10px; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin: 10px 0; }
    td, th { border: 1px solid #555; padding: 5px 8px; }
    th { background: #e8e8e8; font-weight: 700; text-align: center; }
    .ttd-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; text-align: center; font-size: 11pt; }
    .ttd-space { height: 52px; }
    .print-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 999;
      display: flex; gap: 10px;
    }
    .print-btn button {
      padding: 10px 22px; font-size: 14px; font-weight: 700;
      border: none; border-radius: 8px; cursor: pointer;
    }
    .btn-print { background: #1e5631; color: #fff; }
    .btn-close { background: #ccc; color: #333; }
    ${SURAT_CSS}
  </style>
</head>
<body>
  ${bodyHTML}
  <div class="print-btn no-print">
    <button class="btn-close" onclick="window.close()">✕ Tutup</button>
    <button class="btn-print" onclick="window.print()">🖨️ Print / Simpan PDF</button>
  </div>
  <script>
    // Auto-trigger print dialog optional
  <\/script>
</body>
</html>`);
  win.document.close();
}

function buildRekapTotalHTML(kelasFil, tgl) {
  // Indeks tagihan per nama: tanpa ini tiap baris menyisir seluruh tagihan
  // (3000 santri × 6000 tagihan ≈ 0,7 dtk).
  return withTagihanIndex(() => _buildRekapTotalHTML(kelasFil, tgl));
}
function _buildRekapTotalHTML(kelasFil, tgl) {
  const P2 = getProfil();
  const tglFmt = new Date(tgl).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  // Hanya santri aktif: alumni, santri pindah/keluar, dan calon santri SPMB
  // tetap tersimpan di tabel yang sama dan akan ikut tercetak bila tidak disaring.
  let list = appState.students.filter(s => isSantriAktif(s) && (!kelasFil || s.kelas === kelasFil));
  const totalBayar = list.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length, 0);
  const totalTk = list.reduce((a,s)=>a+totalTunggakan(s),0);
  return `
  <div class="pdf-preview" id="suratPreviewTotal">
    <div class="kop-surat">
      <div class="kop-logo">${getLogo() ? `<img class="s-logo-img" src="${safeUrl(getLogo())}">` : '🕌'}</div>
      <div class="kop-text">
        <h2>${esc(P2.nama)}</h2>
        <p>${esc(P2.alamat)}${P2.kota?', '+esc(P2.kota):''}${P2.provinsi?', '+esc(P2.provinsi):''}<br>${P2.telp?'Telp. '+esc(P2.telp)+' ':''} ${P2.email?'| Email: '+esc(P2.email):''}</p>
      </div>
    </div>
    <div class="surat-body">
      <h3>REKAP PEMBAYARAN SANTRI ${kelasFil?'KELAS '+esc(kelasFil):'SELURUH KELAS'}</h3>
      <p class="s-mb10">Tahun Ajaran ${esc(P2.ta || '—')} &nbsp;|&nbsp; Per Tanggal: ${tglFmt}<br>
      Total Santri: <strong>${list.length}</strong> orang${sppDueMonthLabel() ? ' &nbsp;|&nbsp; Tunggakan SPP dihitung s/d bulan ' + esc(sppDueMonthLabel()) : ''}${list.some(s => sppTunggakanPrev(s) > 0) ? ' &nbsp;|&nbsp; Kolom Tunggakan sudah termasuk sisa SPP Tahun Ajaran sebelumnya' : ''}</p>
      <table class="data-table-pdf">
        <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>SPP Dibayar</th><th>Item Terbayar</th><th>Tunggakan</th></tr></thead>
        <tbody>
          ${list.map((s,i)=>{
            const tk = totalTunggakan(s);
            const prev = sppTunggakanPrev(s);
            const itemBayar = tagihanOf(s.nama).reduce((a,t)=>a+(t.paid_amount||0),0);
            return `<tr${tk>0?' class="s-row-due"':''}>
              <td class="s-c">${i+1}</td>
              <td>${esc(s.nama)}</td><td>${esc(s.kelas)}</td>
              <td class="s-r">${((s.spp_paid_months||[]).length*(s.spp||0)).toLocaleString('id-ID')}</td>
              <td class="s-r">${itemBayar.toLocaleString('id-ID')}</td>
              <td class="s-r${tk>0?' s-due':''}">${tk>0?tk.toLocaleString('id-ID'):'Lunas'}${prev>0?`<br><span class="s-small s-normal">termasuk T.A. lalu ${prev.toLocaleString('id-ID')}</span>`:''}</td>
            </tr>`;
          }).join('')}
          <tr class="s-total-row s-b">
            <td colspan="3" class="s-r">TOTAL</td>
            <td class="s-r">${list.reduce((a,s)=>a+(s.spp||0)*(s.spp_paid_months||[]).length,0).toLocaleString('id-ID')}</td>
            <td class="s-r">${list.reduce((a,s)=>a+tagihanOf(s.nama).reduce((b,t)=>b+(t.paid_amount||0),0),0).toLocaleString('id-ID')}</td>
            <td class="s-r s-red">${totalTk.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>
      <div class="ttd-section">
        <div class="ttd-box"><p>Mengetahui,<br>Kepala Madrasah</p><div class="ttd-space"></div><p><strong>${esc(P2.kepsek)}</strong>${P2.kepsek_nip?'<br><small>'+esc(P2.kepsek_nip)+'</small>':''}</p></div>
        <div class="ttd-box"><p>${esc(P2.kota||'Tarakan')}, ${tglFmt}<br>Bendahara</p><div class="ttd-space"></div><p><strong>${esc(P2.bendahara)}</strong>${P2.bendahara_nip?'<br><small>'+esc(P2.bendahara_nip)+'</small>':''}</p></div>
      </div>
    </div>
  </div>`;
}

function exportTunggakanPDF() {
  previewPDFTotal(); // reuse but filtered
  showPage('cetak');
  setTimeout(() => switchCetakTab('total', document.querySelectorAll('.tab')[1]), 100);
}


// ══════════════════════════════════════════
;// ══ js/profil.js ══
// ── SiPay · Profil Sekolah ──
// PROFIL MADRASAH
// ══════════════════════════════════════════
const DEFAULT_PROFIL = {
  nama: 'Madrasah Terpadu',
  alamat: 'Jl. Pendidikan Islam No. 1',
  kota: 'Tarakan',
  provinsi: 'Kalimantan Utara',
  telp: '(0551) 123456',
  email: 'admin@madrasah.sch.id',
  web: 'www.madrasah.sch.id',
  nsm: '',
  // Diisi saat modul dimuat (lihat di bawah) — jangan dipatok ke satu tahun,
  // karena nilai ini terlihat di layar login sebelum profil dari server termuat.
  ta: '',
  akreditasi: 'A',
  kepsek: 'HARMIN, S.Pd',
  kepsek_nip: '',
  bendahara: 'RUDDY HERMANTO',
  bendahara_nip: '',
};

// Tahun ajaran bawaan diturunkan dari tanggal hari ini (tahun ajaran mulai
// Juli), bukan dipatok. Ini hanya dipakai sampai profil dari server termuat.
(function initDefaultTA() {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  DEFAULT_PROFIL.ta = `${y}/${y + 1}`;
})();

function getProfil() {
  try { return JSON.parse(localStorage.getItem('sipay_profil') || 'null') || DEFAULT_PROFIL; }
  catch { return DEFAULT_PROFIL; }
}
function getLogo() {
  return localStorage.getItem('sipay_logo') || '';
}
function saveProfil() {
  const g = id => document.getElementById(id).value.trim();
  const p = {
    nama: g('pf_nama') || DEFAULT_PROFIL.nama,
    alamat: g('pf_alamat'), kota: g('pf_kota'), provinsi: g('pf_provinsi'),
    telp: g('pf_telp'), email: g('pf_email'), web: g('pf_web'), nsm: g('pf_nsm'),
    ta: g('pf_ta'), akreditasi: g('pf_akreditasi'),
    kepsek: g('pf_kepsek') || DEFAULT_PROFIL.kepsek,
    kepsek_nip: g('pf_kepsek_nip'),
    bendahara: g('pf_bendahara') || DEFAULT_PROFIL.bendahara,
    bendahara_nip: g('pf_bendahara_nip'),
  };
  localStorage.setItem('sipay_profil', JSON.stringify(p));
  applyProfil(p);
  saveSettings();
  closeProfilModal();
  toast('✅ Profil madrasah berhasil disimpan!');
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('⚠️ Ukuran file maksimal 2MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    localStorage.setItem('sipay_logo', dataUrl);
    applyLogoPreview(dataUrl);
    applyLogoEverywhere(dataUrl);
    saveSettings(); // sync logo ke Supabase
    toast('✅ Logo berhasil diupload!');
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  localStorage.removeItem('sipay_logo');
  applyLogoPreview('');
  applyLogoEverywhere('');
  document.getElementById('pf_logo_input').value = '';
  // Hapus logo dari Supabase
  sb('settings?key=eq.logo', 'DELETE', null, { 'Prefer': 'return=minimal' }).catch(()=>{});
  toast('🗑️ Logo dihapus');
}

function applyLogoPreview(dataUrl) {
  const prev = document.getElementById('pf_logo_preview');
  const removeBtn = document.getElementById('pf_logo_remove');
  if (!prev) return;
  if (dataUrl) {
    prev.innerHTML = `<img class="img-cover" src="${safeUrl(dataUrl)}">`;
    prev.style.borderStyle = 'solid';
    prev.style.borderColor = 'var(--primary-light)';
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    prev.innerHTML = '🕌';
    prev.style.borderStyle = 'dashed';
    prev.style.borderColor = 'var(--border)';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function applyLogoEverywhere(dataUrl) {
  // Banner dashboard
  const bannerLogo = document.getElementById('bannerLogoWrap');
  if (bannerLogo) {
    bannerLogo.innerHTML = dataUrl
      ? `<img class="img-cover" src="${safeUrl(dataUrl)}">`
      : '🕌';
  }
  // Sidebar
  const sidebarLogo = document.getElementById('sidebarLogoWrap');
  if (sidebarLogo) {
    sidebarLogo.innerHTML = dataUrl
      ? `<img class="img-cover" src="${safeUrl(dataUrl)}">`
      : '🕌';
  }
}

function applyProfil(p) {
  if (!p) p = getProfil();
  const el = id => document.getElementById(id);
  if (el('profilNama')) el('profilNama').textContent = p.nama;
  if (el('profilAlamat')) el('profilAlamat').textContent = [p.alamat, p.kota, p.provinsi].filter(Boolean).join(', ');
  if (el('profilKontak')) el('profilKontak').innerHTML = [
    p.telp ? '<svg class="ic"><use href="#i-phone"/></svg> ' + esc(p.telp) : '',
    p.email ? '<svg class="ic"><use href="#i-mail"/></svg> ' + esc(p.email) : '',
    p.ta ? '<svg class="ic"><use href="#i-cal"/></svg> TA ' + esc(p.ta) : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const sn = document.querySelector('.sidebar-logo .school-name');
  if (sn) sn.innerHTML = esc(p.nama).replace(/\s+/, '<br>');
  // Layar login: ikut tahun ajaran di profil, jangan dipatok di HTML.
  if (el('loginTaLabel')) el('loginTaLabel').textContent = (p.ta ? 'TA ' + p.ta + ' • ' : '') + 'SiPay v1.0';
  // Apply logo
  applyLogoEverywhere(getLogo());
}
function openProfilModal() {
  const p = getProfil();
  document.getElementById('pf_nama').value = p.nama;
  document.getElementById('pf_alamat').value = p.alamat;
  document.getElementById('pf_kota').value = p.kota;
  document.getElementById('pf_provinsi').value = p.provinsi;
  document.getElementById('pf_telp').value = p.telp;
  document.getElementById('pf_email').value = p.email;
  document.getElementById('pf_web').value = p.web || '';
  document.getElementById('pf_nsm').value = p.nsm || '';
  document.getElementById('pf_ta').value = p.ta;
  document.getElementById('pf_akreditasi').value = p.akreditasi || '';
  document.getElementById('pf_kepsek').value = p.kepsek;
  document.getElementById('pf_kepsek_nip').value = p.kepsek_nip || '';
  document.getElementById('pf_bendahara').value = p.bendahara;
  document.getElementById('pf_bendahara_nip').value = p.bendahara_nip || '';
  // Show current logo in preview
  applyLogoPreview(getLogo());
  document.getElementById('profilModal').classList.add('open');
}
function closeProfilModal() { document.getElementById('profilModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ══════════════════════════════════════════
;// ══ js/manajemen-siswa.js ══
// ── SiPay · Manajemen Siswa (Tambah/Edit/Hapus/Bulk) ──

// ══════════════════════════════════════════
// PROMOSI KELAS
// ══════════════════════════════════════════
let promosiMap = new Map(); // nama -> 'naik' | 'tinggal'

// Normalisasi label TA jadi "YYYY/YYYY"; '' bila tidak sah.
function normTaLabel(v) {
  const m = String(v || '').match(/^\s*(\d{4})\s*[\/\-]\s*(\d{4})\s*$/);
  return (m && Number(m[2]) === Number(m[1]) + 1) ? `${m[1]}/${m[2]}` : '';
}

function openPromosiKelasModal() {
  promosiMap = new Map();
  // Label arsip default = TA di Profil, yaitu tahun ajaran yang baru berakhir.
  // Bisa diperbaiki admin bila TA di Profil terlanjur dimajukan lebih dulu.
  const inp = document.getElementById('promosiTaInput');
  if (inp) inp.value = getProfil().ta || '';
  onPromosiTaChange();
  renderPromosiStudentList();
  updatePromosiSummary();
  document.getElementById('promosiKelasModal').classList.add('open');
}

// Perbarui label "TA berjalan berikutnya" + peringatan bila label arsip tidak
// sah atau justru sama dengan tahun ajaran berjalan (penyebab tunggakan ganda).
function onPromosiTaChange() {
  const raw  = document.getElementById('promosiTaInput')?.value || '';
  const ta   = normTaLabel(raw);
  const awal = parseInt(ta) || 0;
  const baru = awal ? `${awal + 1}/${awal + 2}` : '—';
  const lblBaru = document.getElementById('promosiTaBaru');
  if (lblBaru) lblBaru.textContent = baru;

  const warn = document.getElementById('promosiTaWarn');
  const btn  = document.getElementById('promosiConfirmBtn');
  let pesan = '';
  if (raw.trim() && !ta) {
    pesan = '<svg class="ic"><use href="#i-alert"/></svg> Format tahun ajaran belum benar — tulis seperti 2025/2026 (tahun kedua = tahun pertama + 1).';
  } else if (ta && !document.getElementById('promosiSetProfilTA')?.checked
             && typeof isTaBerjalanAtauSesudah === 'function' && isTaBerjalanAtauSesudah(ta)) {
    // TA arsip sama dengan TA berjalan sementara TA di Profil tidak ikut maju →
    // tahun yang sama akan tampil dua kali (SPP berjalan + tunggakan TA lalu).
    pesan = `<svg class="ic"><use href="#i-alert"/></svg> TA ${ta} masih menjadi TA berjalan di Profil. Centang "Setel TA berjalan di Profil" `
          + 'atau perbaiki label di atas, agar tahun ini tidak terhitung dua kali.';
  }
  if (warn) { setIconText(warn, pesan); warn.style.display = pesan ? 'block' : 'none'; }
  if (btn) btn.disabled = !promosiMap.size || !ta;   // label TA wajib & harus sah
}

function renderPromosiStudentList() {
  const students = appState.students
    .filter(s => !s.status_kelulusan)
    .sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));

  const list = document.getElementById('promosiStudentList');
  if (!students.length) {
    list.innerHTML = '<div class="p-24 text-center text-muted">Tidak ada santri aktif.</div>';
    return;
  }

  let html = '';
  let lastKelas = '';

  students.forEach((s, i) => {
    if (s.kelas !== lastKelas) {
      lastKelas = s.kelas;
      html += `<div class="kelas-group-title${i>0?' is-next':''}">
        Kelas ${esc(s.kelas)}
      </div>`;
    }

    const sel     = promosiMap.has(s.nama);
    const action  = promosiMap.get(s.nama) || 'naik';
    const nameSafe = escJs(s.nama);
    const nextKelas = s.kelas === '7' ? '8' : s.kelas === '8' ? '9' : null;
    const nextLabel = nextKelas
      ? `<span class="text-primary fw-600">→ Kelas ${nextKelas}</span>`
      : `<span class="text-accent fw-600">→ Lulus <svg class="ic"><use href="#i-grad"/></svg></span>`;

    html += `<div class="list-row">
      <input class="w-15 h-15 accent-primary shrink-0" type="checkbox" ${sel?'checked':''} onchange="togglePromosiStudent('${nameSafe}',this.checked)"
       >
      <div class="flex-1 minw-0">
        <div class="fw-600 fs-13">${esc(s.nama)}</div>
        <div class="hint">Kelas ${esc(s.kelas)}</div>
      </div>
      ${sel ? `
        <label class="promosi-opt${action==='naik'?' is-naik':''}">
          <input class="accent-primary" type="radio" name="pa${i}" value="naik" ${action==='naik'?'checked':''}
            onchange="setStudentPromosiAction('${nameSafe}','naik')"> Naik Kelas
        </label>
        <label class="promosi-opt${action==='tinggal'?' is-tinggal':''}">
          <input class="accent-danger" type="radio" name="pa${i}" value="tinggal" ${action==='tinggal'?'checked':''}
            onchange="setStudentPromosiAction('${nameSafe}','tinggal')"> Tinggal Kelas
        </label>
        <div class="fs-12 minw-90 text-right">
          ${action==='naik' ? nextLabel : `<span class="text-muted">Tetap Kls ${esc(s.kelas)}</span>`}
        </div>
      ` : `<div class="fs-12 text-border minw-200 text-right">—</div>`}
    </div>`;
  });

  list.innerHTML = html;
}

function togglePromosiStudent(nama, checked) {
  if (checked) promosiMap.set(nama, 'naik');
  else promosiMap.delete(nama);
  renderPromosiStudentList();
  updatePromosiSummary();
}

function setStudentPromosiAction(nama, action) {
  if (promosiMap.has(nama)) promosiMap.set(nama, action);
  renderPromosiStudentList();
  updatePromosiSummary();
}

function selectKelasGroup(kelas) {
  const aktif = appState.students.filter(s => !s.status_kelulusan);
  if (kelas === 'none') {
    promosiMap.clear();
  } else if (kelas === 'all') {
    aktif.forEach(s => promosiMap.set(s.nama, 'naik'));
  } else {
    aktif.filter(s => s.kelas === kelas).forEach(s => promosiMap.set(s.nama, 'naik'));
  }
  renderPromosiStudentList();
  updatePromosiSummary();
}

function updatePromosiSummary() {
  const naik    = [...promosiMap].filter(([,a]) => a === 'naik').length;
  const tinggal = [...promosiMap].filter(([,a]) => a === 'tinggal').length;
  const lulus   = [...promosiMap].filter(([nama, a]) => {
    const s = appState.students.find(x => x.nama === nama);
    return a === 'naik' && s && s.kelas === '9';
  }).length;
  const el  = document.getElementById('promosiSummary');
  const btn = document.getElementById('promosiConfirmBtn');
  if (!promosiMap.size) {
    el.textContent = 'Belum ada santri dipilih.';
    btn.disabled = true;
    return;
  }
  el.innerHTML = `<strong>${promosiMap.size} santri</strong> dipilih — `
    + `<span class="text-primary">${naik} naik kelas</span>`
    + (lulus ? ` <span class="text-accent">(${lulus} di antaranya lulus <svg class="ic"><use href="#i-grad"/></svg>)</span>` : '')
    + (tinggal ? `, <span class="text-danger">${tinggal} tinggal kelas</span>` : '');
  btn.disabled = false;
  onPromosiTaChange();   // label TA juga menentukan tombol boleh ditekan
}

async function confirmPromosiKelas() {
  if (!promosiMap.size) return;
  // TA arsip diambil dari isian modal (default: TA di Profil) — inilah tahun
  // ajaran yang BARU BERAKHIR, bukan tahun ajaran baru.
  const ta = normTaLabel(document.getElementById('promosiTaInput')?.value || '');
  if (!ta) { toast('⚠️ Isi tahun ajaran yang diarsipkan dulu — format 2025/2026.'); return; }
  const setProfilTA = !!document.getElementById('promosiSetProfilTA')?.checked;
  const taBaru = `${parseInt(ta) + 1}/${parseInt(ta) + 2}`;
  if (!setProfilTA && typeof isTaBerjalanAtauSesudah === 'function' && isTaBerjalanAtauSesudah(ta)
      && !confirm(`TA ${ta} masih tercatat sebagai tahun ajaran berjalan di Profil.\n\n`
        + 'Bila diarsipkan tanpa memajukan TA di Profil, tunggakan tahun ini bisa terbaca dua kali.\n\n'
        + 'Lanjutkan?')) return;
  let count = 0;
  const touched = [];   // hanya santri yang benar-benar diproses yang dikirim

  // Tahan sinkronisasi latar belakang selama proses: kalau data ditarik ulang
  // di tengah jalan, hasil promosi yang belum tersimpan bisa tertimpa.
  pauseAutoSync();
  try {
    for (const [nama, action] of promosiMap) {
      const idx = appState.students.findIndex(s => s.nama === nama);
      if (idx < 0) continue;
      const s = appState.students[idx];

      // Arsipkan SPP tahun berjalan ke riwayat sebelum reset (tunggakan tahun lalu)
      snapshotSppTahunBerjalan(s, ta);

      // Reset bulan SPP untuk tahun ajaran baru. Penanda "SPP mulai bulan"
      // hanya berlaku untuk TA yang baru diarsipkan — di tahun ajaran baru
      // santri tersebut ditagih penuh dari Juli seperti santri lain.
      s.spp_paid_months = [];
      s.spp_angsur = {};
      s.spp_mulai = '';

      if (action === 'naik') {
        if      (s.kelas === '7') s.kelas = '8';
        else if (s.kelas === '8') s.kelas = '9';
        else if (s.kelas === '9') s.status_kelulusan = 'lulus';
      }
      // tinggal kelas: kelas tetap, data sudah direset

      touched.push(s);
      count++;
    }

    // Simpan HANYA santri yang diproses (bukan seluruh tabel) supaya perubahan
    // santri lain yang dibuat dari device lain tidak ikut tertimpa.
    showSyncIndicator('💾 Menyimpan...');
    try {
      for (let i = 0; i < touched.length; i += 50) await saveStudentsBatch(touched.slice(i, i + 50));
      showSyncIndicator('✅ Tersimpan', 2000);
    } catch (e) {
      console.error('confirmPromosiKelas save:', e);
      showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
      toast('⚠️ Promosi kelas gagal tersimpan — cek koneksi lalu ulangi');
      return;
    }

    // Majukan TA berjalan di Profil supaya tahun yang baru diarsipkan tidak
    // lagi terbaca sebagai tahun ajaran berjalan (sumber tunggakan ganda).
    let taInfo = '';
    if (setProfilTA) {
      try {
        const pr = getProfil();
        pr.ta = taBaru;
        localStorage.setItem('sipay_profil', JSON.stringify(pr));
        applyProfil(pr);
        await saveSettings();
        taInfo = ` — TA berjalan kini ${taBaru}`;
      } catch (e) {
        console.error('confirmPromosiKelas set TA:', e);
        toast(`⚠️ TA di Profil gagal dimajukan ke ${taBaru} — setel manual di menu Profil`, 5000);
      }
    }

    document.getElementById('promosiKelasModal').classList.remove('open');
    promosiMap.clear();
    renderSiswaTable();
    renderDashboard();
    renderTunggakan();
    toast(`✅ Promosi kelas selesai — ${count} santri diproses${taInfo}`);
  } finally { resumeAutoSync(); }
}

// KELAS CHIP FILTER
// ══════════════════════════════════════════
let activeKelasFilter = '';
function setKelasChip(el) {
  document.querySelectorAll('#kelasChips .kchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  activeKelasFilter = el.dataset.kelas;
  renderSiswaTable();
}

// ══════════════════════════════════════════
// BULK SELECTION
// ══════════════════════════════════════════
let selectedRows = new Set();
function toggleSelectAll(chk) {
  const allChks = document.querySelectorAll('#siswaTable tbody .row-chk');
  allChks.forEach(c => {
    c.checked = chk.checked;
    const nama = c.dataset.nama;
    if (chk.checked) selectedRows.add(nama); else selectedRows.delete(nama);
  });
  updateBulkBar();
}
function toggleRowSelect(chk) {
  if (chk.checked) selectedRows.add(chk.dataset.nama);
  else selectedRows.delete(chk.dataset.nama);
  const allChks = document.querySelectorAll('#siswaTable tbody .row-chk');
  document.getElementById('chkAll').checked = allChks.length > 0 && [...allChks].every(c => c.checked);
  updateBulkBar();
}
function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (selectedRows.size > 0) {
    bar.classList.add('show');
    document.getElementById('bulkCount').textContent = selectedRows.size + ' santri dipilih';
  } else {
    bar.classList.remove('show');
  }
}
function clearSelection() {
  selectedRows.clear();
  document.querySelectorAll('.row-chk').forEach(c => c.checked = false);
  const ca = document.getElementById('chkAll');
  if (ca) ca.checked = false;
  updateBulkBar();
}
let _selectedBulkStatus = '';
function openBulkStatusModal() {
  if (!selectedRows.size) return;
  const names = [...selectedRows];
  document.getElementById('bulkStatusMsg').textContent =
    `Pilih status baru untuk ${names.length} santri: ${names.slice(0,3).join(', ')}${names.length > 3 ? ' dan ' + (names.length - 3) + ' lainnya' : ''}.`;
  document.querySelectorAll('input[name="bulkStatus"]').forEach(r => r.checked = false);
  _selectedBulkStatus = '';
  document.getElementById('bulkStatusConfirmBtn').disabled = true;
  document.getElementById('bulkStatusModal').classList.add('open');
}
function selectBulkStatus(val) {
  _selectedBulkStatus = val;
  const radio = document.querySelector(`input[name="bulkStatus"][value="${val}"]`);
  if (radio) radio.checked = true;
  document.getElementById('bulkStatusConfirmBtn').disabled = false;
}
async function confirmBulkStatus() {
  if (!_selectedBulkStatus || !selectedRows.size) return;
  const names = [...selectedRows];
  const statusVal = _selectedBulkStatus === 'aktif' ? '' : _selectedBulkStatus;
  const ta = getProfil().ta || '';
  const touched = [];

  pauseAutoSync();   // jangan tarik ulang data selagi perubahan belum tersimpan
  try {
    names.forEach(nama => {
      const idx = appState.students.findIndex(s => s.nama === nama);
      if (idx < 0) return;
      const s = appState.students[idx];
      // Santri LULUS: arsipkan SPP tahun berjalan ke riwayat lalu reset — sama
      // seperti promosi kelas — sehingga tunggakannya jadi "tunggakan tahun lalu"
      // dan tidak lagi tampil sebagai SPP tahun berjalan.
      if (statusVal === 'lulus' && s.status_kelulusan !== 'lulus') {
        snapshotSppTahunBerjalan(s, ta);
        s.spp_paid_months = [];
        s.spp_angsur = {};
      }
      s.status_kelulusan = statusVal;
      touched.push(s);
    });

    // Kirim hanya santri terpilih, bukan seluruh tabel.
    showSyncIndicator('💾 Menyimpan...');
    try {
      for (let i = 0; i < touched.length; i += 50) await saveStudentsBatch(touched.slice(i, i + 50));
      showSyncIndicator('✅ Tersimpan', 2000);
    } catch (e) {
      console.error('confirmBulkStatus save:', e);
      showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
      toast('⚠️ Perubahan status gagal tersimpan — cek koneksi lalu ulangi');
      return;
    }

    document.getElementById('bulkStatusModal').classList.remove('open');
    clearSelection();
    renderSiswaTable();
    renderDashboard();
    const label = { '': 'Aktif', 'lulus': 'Lulus', 'pindah': 'Pindah', 'keluar': 'Keluar' }[statusVal];
    toast(`✅ ${names.length} santri diubah statusnya menjadi ${label}`);
  } finally { resumeAutoSync(); }
}

function deleteSelected() {
  if (!selectedRows.size) return;
  const names = [...selectedRows];
  document.getElementById('deleteMsg').textContent = `Anda akan menghapus ${names.length} santri: ${names.slice(0,3).join(', ')}${names.length>3?' dan '+(names.length-3)+' lainnya':''}. Data pembayaran mereka juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => !selectedRows.has(s.nama));
    appState.transactions = appState.transactions.filter(t => !selectedRows.has(t.nama));
    appState.tagihan = appState.tagihan.filter(t => !selectedRows.has(t.nama));
    selectedRows.clear(); updateBulkBar();
    document.getElementById('deleteModal').classList.remove('open');
    renderSiswaTable();
    toast(`🗑️ ${names.length} santri berhasil dihapus`);
    await Promise.all(names.flatMap(n => [deleteStudentFromDB(n), deleteTransactionsByNama(n), deleteTagihanByNama(n)]));
  };
  document.getElementById('deleteModal').classList.add('open');
}
function deleteSingle(nama) {
  document.getElementById('deleteMsg').textContent = `Hapus data santri "${nama}"? Seluruh data pembayaran santri ini juga akan dihapus.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => s.nama !== nama);
    appState.transactions = appState.transactions.filter(t => t.nama !== nama);
    appState.tagihan = appState.tagihan.filter(t => t.nama !== nama);
    document.getElementById('deleteModal').classList.remove('open');
    renderSiswaTable();
    toast(`🗑️ ${nama} berhasil dihapus`);
    await deleteStudentFromDB(nama);
    await deleteTransactionsByNama(nama);
    await deleteTagihanByNama(nama);
  };
  document.getElementById('deleteModal').classList.add('open');
}
// [dipindah ke DOMContentLoaded]

// ══════════════════════════════════════════
// ADD SISWA
// ══════════════════════════════════════════
function openTambahChoice() {
  document.getElementById('tambahChoiceModal').classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tambahChoiceModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

function openAddSiswaModal() {
  document.getElementById('tambahChoiceModal').classList.remove('open');
  ['ns_nama','ns_nisn','ns_spp'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('ns_kelas').value = '';
  // Prefill nominal pangkal & pendaftaran dengan nilai default dari Kelola Item Bayar
  const _prefillDefault = (fieldId, itemId) => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const it = appState.payItems.find(i => i.id === itemId);
    el.value = it && it.amount ? it.amount : '';
  };
  _prefillDefault('ns_pangkal', 'pangkal');
  _prefillDefault('ns_pendaftaran', 'pendaftaran');
  document.querySelectorAll('#ns_months_wrap input[type=checkbox]').forEach(c => c.checked = false);
  const taInput = document.getElementById('ns_ta');
  if (taInput) taInput.value = getProfil().ta || '';
  document.getElementById('addSiswaModal').classList.add('open');
}
// Cari index siswa yang cocok berdasarkan NISN → nama eksak → fuzzy
// Return index di appState.students, atau -1 jika tidak ditemukan
function findExistingSiswaIdx(kandidat) {
  const students = appState.students;
  if (kandidat.nisn && kandidat.nisn.trim()) {
    const idx = students.findIndex(s => s.nisn && s.nisn.trim() === kandidat.nisn.trim());
    if (idx >= 0) return idx;
  }
  const normK = normNama(kandidat.nama);
  const idx2 = students.findIndex(s => normNama(s.nama) === normK);
  if (idx2 >= 0) return idx2;
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (!kandidat.nisn || !s.nisn) {
      if (nameSimilarity(kandidat.nama, s.nama) >= 0.85) return i;
    }
  }
  return -1;
}

async function saveNewSiswa() {
  const nama = document.getElementById('ns_nama').value.trim().toUpperCase();
  const kelas = document.getElementById('ns_kelas').value;
  if (!nama) { toast('⚠️ Nama santri wajib diisi!'); return; }
  if (!kelas) { toast('⚠️ Kelas wajib dipilih!'); return; }

  const paid_months = [...document.querySelectorAll('#ns_months_wrap input[type=checkbox]:checked')].map(c => c.value);
  const spp = Number(document.getElementById('ns_spp').value) || 0;
  const pangkal = Number(document.getElementById('ns_pangkal')?.value) || 0;
  const pendaftaran = Number(document.getElementById('ns_pendaftaran')?.value) || 0;

  const newSiswa = {
    nama, kelas,
    nisn: document.getElementById('ns_nisn').value.trim(),
    spp, spp_paid_months: paid_months,
    spp_history: {}, status_kelulusan: '',
  };

  const existIdx = findExistingSiswaIdx(newSiswa);
  if (existIdx >= 0) {
    const old = appState.students[existIdx];
    old.spp = spp || old.spp;
    old.spp_paid_months = [...new Set([...(old.spp_paid_months||[]), ...paid_months])];
    if (newSiswa.nisn && !old.nisn) old.nisn = newSiswa.nisn;
    appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
    saveSiswa(old);
    if (pangkal > 0) await upsertPangkalTagihan(old, pangkal).catch(() => {});
    if (pendaftaran > 0) await upsertPendaftaranTagihan(old, pendaftaran).catch(() => {});
    document.getElementById('addSiswaModal').classList.remove('open');
    renderSiswaTable(); renderTunggakan(); renderDashboard();
    toast(`🔄 Data ${old.nama} diperbarui & digabung!`);
    return;
  }

  appState.students.push(newSiswa);
  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
  saveSiswa(newSiswa);
  document.getElementById('addSiswaModal').classList.remove('open');
  toast(`✅ ${nama} berhasil ditambahkan!`);
  // Buat tagihan: pangkal & pendaftaran pakai nominal per-siswa; item tetap lain default
  try {
    await upsertPangkalTagihan(newSiswa, pangkal);
    await upsertPendaftaranTagihan(newSiswa, pendaftaran);
    await createTagihanForStudent(newSiswa);
  } catch(e) { console.error('createTagihan saveNewSiswa:', e); }
  renderSiswaTable(); renderTunggakan(); renderDashboard();
}
// [dipindah ke DOMContentLoaded]


// ══════════════════════════════════════════
// EDIT SISWA
// ══════════════════════════════════════════
function openEditPembayaran(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('ep_nama').value = nama;
  document.getElementById('ep_namaLabel').textContent = nama + ' — ' + kelasLabel(s);
  document.querySelectorAll('#ep_months_wrap input[type=checkbox]').forEach(c => {
    c.checked = (s.spp_paid_months || []).includes(c.value);
  });
  // Render tagihan items
  const siswaTagihan = appState.tagihan.filter(t => t.nama === nama);
  const tagihanWrap = document.getElementById('ep_tagihan_wrap');
  if (tagihanWrap) {
    if (!siswaTagihan.length) {
      tagihanWrap.innerHTML = '<div class="hint">Tidak ada tagihan item untuk santri ini.</div>';
    } else {
      tagihanWrap.innerHTML = siswaTagihan.map(t => `
        <div class="list-row">
          <div class="flex-1 fs-13 fw-600">${esc(t.item_name)}</div>
          <div class="hint">Total: ${rp(t.nominal)}</div>
          <div class="flex items-center gap-6">
            <label class="fs-12">Terbayar:</label>
            <input type="number" class="ep_tagihan_paid w-110 p-5-8 border-1-border rounded-6 fs-13" data-id="${t.id}" value="${t.paid_amount||0}"
             >
          </div>
        </div>`).join('');
    }
  }
  document.getElementById('editPembayaranModal').classList.add('open');
}

async function saveEditPembayaran() {
  const nama = document.getElementById('ep_nama').value;
  const idx  = appState.students.findIndex(s => s.nama === nama);
  if (idx < 0) { toast('⚠️ Data tidak ditemukan'); return; }

  const paid_months = [...document.querySelectorAll('#ep_months_wrap input[type=checkbox]:checked')].map(c => c.value);
  appState.students[idx].spp_paid_months = paid_months;
  saveSiswa(appState.students[idx]);

  // Update tagihan paid amounts
  const inputs = document.querySelectorAll('.ep_tagihan_paid');
  for (const inp of inputs) {
    const tid = inp.dataset.id;
    const newPaid = Number(inp.value) || 0;
    const t = appState.tagihan.find(x => x.id === tid);
    if (t && t.paid_amount !== newPaid) {
      await updateTagihanPaid(tid, newPaid);
    }
  }

  document.getElementById('editPembayaranModal').classList.remove('open');
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();
  const detailEl = document.getElementById('tunggakanDetail');
  if (detailEl?.innerHTML) selectTunggakanStudent(nama);
  toast(`✅ Data pembayaran ${nama} berhasil diperbarui!`);
}

function openEditSiswa(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('ed_original_nama').value = s.nama;
  document.getElementById('ed_nama').value = s.nama;
  document.getElementById('ed_nisn').value = s.nisn || '';
  document.getElementById('ed_kelas').value = s.kelas;
  document.getElementById('ed_spp').value = s.spp || '';
  const edPangkal = document.getElementById('ed_pangkal');
  if (edPangkal) { const p = getPangkalNominal(s.nama); edPangkal.value = p || ''; }
  const edPendaftaran = document.getElementById('ed_pendaftaran');
  if (edPendaftaran) { const p = getPendaftaranNominal(s.nama); edPendaftaran.value = p || ''; }
  const edMulai = document.getElementById('ed_spp_mulai');
  if (edMulai) edMulai.innerHTML = sppMulaiOptionsHtml(sppMulaiBulan(s));
  renderSppMulaiWarn('edSppMulaiWarn');
  document.getElementById('editSiswaModal').classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('editSiswaModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

async function saveEditSiswa() {
  const origNama = document.getElementById('ed_original_nama').value;
  const newNama = document.getElementById('ed_nama').value.trim().toUpperCase();
  const kelas   = document.getElementById('ed_kelas').value;
  const pangkal = Number(document.getElementById('ed_pangkal')?.value) || 0;
  const pendaftaran = Number(document.getElementById('ed_pendaftaran')?.value) || 0;
  if (!newNama) { toast('⚠️ Nama santri wajib diisi!'); return; }
  if (!kelas)   { toast('⚠️ Kelas wajib dipilih!'); return; }
  // Cek duplikat nama (kecuali nama sendiri)
  if (newNama !== origNama && appState.students.find(s => s.nama === newNama)) {
    toast('⚠️ Nama santri sudah ada!'); return;
  }
  const idx = appState.students.findIndex(s => s.nama === origNama);
  if (idx < 0) { toast('⚠️ Data tidak ditemukan!'); return; }

  const oldData = appState.students[idx];
  // WAJIB menyalin data lama (`...oldData`) lebih dulu: form ini hanya memuat
  // nama/kelas/NISN/SPP. Tanpa penyalinan, field yang tidak ada di form akan
  // ikut terhapus — terutama `spp_history` (tunggakan SPP tahun ajaran
  // sebelumnya) dan `status_kelulusan`. Riwayat tunggakan itu tidak bisa
  // dibentuk ulang dari kuitansi (bulan yang belum pernah dibayar tak
  // meninggalkan jejak), jadi sekali terhapus datanya hilang permanen.
  appState.students[idx] = {
    ...oldData,
    nama:            newNama,
    kelas,
    nisn:            document.getElementById('ed_nisn').value.trim(),
    spp:             Number(document.getElementById('ed_spp').value) || 0,
    spp_paid_months: oldData.spp_paid_months || [],
    // Bulan mulai tagih SPP (santri masuk di tengah TA) — '' = penuh dari Juli.
    spp_mulai:       buildSppMulai(getProfil().ta || '',
                       document.getElementById('ed_spp_mulai')?.value || ''),
  };

  // Update nama di transactions & tagihan (memori) jika berubah
  if (newNama !== origNama) {
    appState.transactions.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
    appState.tagihan.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
  }

  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
  const savedIdx = appState.students.findIndex(s => s.nama === newNama);
  if (newNama !== origNama) renameStudentInDB(origNama, appState.students[savedIdx]);
  else saveSiswa(appState.students[savedIdx]);
  // Simpan nominal pangkal per-siswa (buat/perbarui tagihan pangkal)
  try {
    await upsertPangkalTagihan(appState.students[savedIdx], pangkal);
    await upsertPendaftaranTagihan(appState.students[savedIdx], pendaftaran);
  } catch(e) { console.error('upsert tagihan per-siswa:', e); }
  document.getElementById('editSiswaModal').classList.remove('open');

  // Refresh semua tampilan terkait
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();

  toast(`✅ Data ${newNama} berhasil diperbarui!`);
}

// ══════════════════════════════════════════
// IMPORT WIZARD STEPS
;// ══ js/import.js ══
// ── SiPay · Import Siswa (Excel/CSV) ──
// ══════════════════════════════════════════
function impGoStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById('imp_step'+i).style.display = i===n ? 'block' : 'none';
    const ind = document.getElementById('imp_step'+i+'_ind');
    ind.style.background = i===n ? 'var(--primary)' : i<n ? 'var(--primary-light)' : 'var(--border)';
    ind.style.color = i<=n ? '#fff' : 'var(--text-muted)';
  });
}
function openImportModal() {
  document.getElementById('tambahChoiceModal').classList.remove('open');
  document.getElementById('importFile').value = '';
  importBuffer = [];
  impGoStep(1);
  document.getElementById('importModal').classList.add('open');
}

// ══════════════════════════════════════════
// IMPORT EXCEL / CSV
// ══════════════════════════════════════════
let importBuffer = [];
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('importModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
});

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result);
    reader.readAsText(file);
  } else {
    // Pustaka Excel ditarik saat dibutuhkan saja (lihat xlsxReady di config.js).
    xlsxReady(() => {
    if (typeof XLSX !== 'undefined') {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, {type:'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, {defval:''});
          parseRows(data);
        } catch(err) {
          toast('⚠️ Gagal membaca file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast('⚠️ Library Excel gagal dimuat. Cek koneksi atau gunakan format CSV.');
    }
    });
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase().replace(/"/g,''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/"/g,''));
    const obj = {};
    headers.forEach((h,idx) => obj[h] = cells[idx]||'');
    rows.push(obj);
  }
  parseRows(rows);
}

function parseRows(rows) {
  importBuffer = [];
  const MONTHS_LIST = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
  const MAP = {
    NAMA: ['NAMA','NAME','NAMA LENGKAP','NAMA_LENGKAP'],
    KELAS: ['KELAS','CLASS','GRADE','TINGKAT - ROMBEL','TINGKAT_ROMBEL','ROMBEL'],
    NISN: ['NISN'],
    TA: ['TAHUN_AJARAN','TA','TAHUN AJARAN','YEAR'],
    SPP: ['SPP','SPP_BULANAN','SPP BULANAN'],
    STATUS: ['STATUS','STATUS_KELULUSAN','STATUS KELULUSAN','STATUS_SANTRI','STATUS SANTRI','STATUS_SISWA','STATUS SISWA','KETERANGAN','KET']
  };
  function findKey(obj, keys) {
    for (const k of keys) {
      const variants = [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g,' ')];
      for (const v of variants) {
        if (obj[v] !== undefined && obj[v] !== '') return obj[v];
      }
    }
    return '';
  }
  function normalizeKelas(k) {
    k = String(k).trim();
    if (/VIII/i.test(k)) return '8';
    if (/IX/i.test(k))   return '9';
    if (/VII/i.test(k))  return '7';
    return k;
  }
  // Petakan status dari kolom data ke nilai internal (lulus/pindah/keluar).
  // Aktif/kosong → '' agar santri tetap dianggap aktif. Nilai tak dikenal
  // dibiarkan aktif ('') supaya tidak keliru menyembunyikan santri.
  function normalizeStatus(v) {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return '';
    if (/lulus|alumni|tamat|graduat/.test(t))              return 'lulus';
    if (/pindah|mutasi|transfer/.test(t))                  return 'pindah';
    if (/keluar|berhenti|mengundurkan|resign|\bdo\b|drop/.test(t)) return 'keluar';
    return ''; // aktif / active / nilai lain
  }
  rows.forEach(row => {
    const nama = String(findKey(row, MAP.NAMA)||'').trim().toUpperCase();
    if (!nama || nama === 'NO' || nama === 'NAMA LENGKAP') return;
    const kelasRaw = findKey(row, MAP.KELAS);
    const kelas = normalizeKelas(kelasRaw);

    // Baca kolom SPP per bulan — cari kolom SPP_Jul, SPP_Agt, dst
    const spp_paid_months = [];
    MONTHS_LIST.forEach(m => {
      const keys = [`SPP_${m}`, `spp_${m}`, `SPP ${m}`, `spp ${m}`, m, m.toUpperCase()];
      for (const k of keys) {
        const val = row[k];
        if (val !== undefined && val !== '' && val != 0 && val !== false) {
          spp_paid_months.push(m);
          break;
        }
      }
    });

    const nisn = String(findKey(row, MAP.NISN)||'').trim().replace(/'/g,'');
    const spp  = Number(String(findKey(row, MAP.SPP)||'0').replace(/[^0-9]/g,''))||0;
    const ta   = String(findKey(row, MAP.TA)||'').trim() || (getProfil ? getProfil().ta : '') || '';
    const status_kelulusan = normalizeStatus(findKey(row, MAP.STATUS));
    importBuffer.push({ nama, kelas, nisn, spp, spp_paid_months, ta, status_kelulusan });
  });
  if (!importBuffer.length) { toast('⚠️ Tidak ada data valid ditemukan di file'); return; }
  // Update header tabel: tambah kolom TA lalu Status
  const thead = document.querySelector('#importPreviewTable thead tr');
  if (thead && !thead.querySelector('.col-ta')) {
    const th = document.createElement('th');
    th.className = 'col-ta';
    th.textContent = 'TA';
    thead.insertBefore(th, thead.children[2]);
  }
  if (thead && !thead.querySelector('.col-status')) {
    const th = document.createElement('th');
    th.className = 'col-status';
    th.textContent = 'Status';
    // Setelah kolom Kelas (No, Nama, TA, Kelas → sisipkan di indeks 4)
    thead.insertBefore(th, thead.children[4]);
  }
  const STATUS_LABEL = { '': 'Aktif', lulus: 'Lulus', pindah: 'Pindah', keluar: 'Keluar' };
  const tbody = document.querySelector('#importPreviewTable tbody');
  tbody.innerHTML = importBuffer.map((s,i) => {
    const bulanLabel = s.spp_paid_months.length
      ? `<span class="text-primary fw-600">${s.spp_paid_months.length} bln</span> <span class="hint">(${esc(s.spp_paid_months.join(', '))})</span>`
      : '<span class="text-muted">—</span>';
    const statusLabel = s.status_kelulusan
      ? `<span class="fs-12 fw-600 text-accent">${esc(STATUS_LABEL[s.status_kelulusan] || s.status_kelulusan)}</span>`
      : '<span class="text-muted">Aktif</span>';
    return `<tr><td>${i+1}</td><td>${esc(s.nama)}</td><td>${esc(s.ta||'—')}</td><td>${esc(s.kelas||'—')}</td><td>${statusLabel}</td><td>${esc(s.nisn||'—')}</td><td>${rp(s.spp)}</td><td>${bulanLabel}</td></tr>`;
  }).join('');
  setIconText(document.getElementById('importPreviewLabel'), `✅ ${importBuffer.length} data santri siap diimport`);
  impGoStep(3);
}

async function confirmImport() {
  let ditambahkan = 0, diperbarui = 0;

  // Group baris berdasarkan NISN (jika ada) atau nama ternormalisasi
  const groups = {};
  importBuffer.forEach(row => {
    const key = (row.nisn && row.nisn.trim())
      ? 'nisn:' + row.nisn.trim()
      : 'nama:' + normNama(row.nama);
    if (!groups[key]) groups[key] = { base: row, taMap: {}, status: row.status_kelulusan || '' };
    // Status non-aktif terakhir yang tercatat menang (mis. baris TA terbaru
    // menandai santri sudah lulus/pindah/keluar).
    if (row.status_kelulusan) groups[key].status = row.status_kelulusan;
    const ta = row.ta || '';
    if (ta) {
      if (!groups[key].taMap[ta]) {
        groups[key].taMap[ta] = { kelas: row.kelas, spp: row.spp, spp_paid_months: [...row.spp_paid_months] };
      } else {
        const ex = groups[key].taMap[ta];
        ex.spp_paid_months = [...new Set([...ex.spp_paid_months, ...row.spp_paid_months])];
        if (row.spp > 0) ex.spp = row.spp;
        ex.kelas = row.kelas;
      }
    }
  });

  const touched = [];   // santri yang benar-benar disentuh import ini
  Object.values(groups).forEach(({ base, taMap, status }) => {
    const candidateNisn = base.nisn || '';
    const existIdx = findExistingSiswaIdx({ nama: base.nama, nisn: candidateNisn });

    if (existIdx >= 0) {
      // Siswa sudah ada — merge SPP data
      const siswa = appState.students[existIdx];
      Object.entries(taMap).forEach(([, taData]) => {
        if (taData.spp > 0) siswa.spp = taData.spp;
        if (taData.kelas) siswa.kelas = taData.kelas;
        siswa.spp_paid_months = [...new Set([...(siswa.spp_paid_months||[]), ...(taData.spp_paid_months||[])])];
      });
      if (candidateNisn && !siswa.nisn) siswa.nisn = candidateNisn;
      // Status dari file menang bila diisi (mis. tandai alumni/pindah/keluar);
      // bila kosong, status santri yang sudah ada dipertahankan.
      if (status) siswa.status_kelulusan = status;
      appState.students[existIdx] = siswa;
      touched.push(siswa);
      diperbarui++;
    } else {
      // Siswa baru
      const latestTA = Object.keys(taMap).sort().reverse()[0];
      const latestData = latestTA ? taMap[latestTA] : {};
      const newSiswa = {
        nama: base.nama, nisn: candidateNisn,
        kelas: latestData.kelas || base.kelas,
        spp: latestData.spp || base.spp,
        spp_paid_months: latestData.spp_paid_months || base.spp_paid_months,
        spp_history: {},
        status_kelulusan: status || '',
      };
      appState.students.push(newSiswa);
      touched.push(newSiswa);
      ditambahkan++;
    }
  });

  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));

  // Kirim hanya santri hasil import (bukan seluruh tabel), supaya perubahan
  // santri lain yang dibuat dari device lain tidak ikut tertimpa.
  pauseAutoSync();
  showSyncIndicator('💾 Menyimpan...');
  try {
    for (let i = 0; i < touched.length; i += 50) await saveStudentsBatch(touched.slice(i, i + 50));
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch (e) {
    console.error('confirmImport save:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
    toast('⚠️ Import gagal tersimpan ke server — cek koneksi lalu ulangi');
    return;
  } finally { resumeAutoSync(); }

  document.getElementById('importModal').classList.remove('open');
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();
  toast(`✅ Import: ${ditambahkan} ditambahkan, ${diperbarui} diperbarui/digabung`);
}

function downloadTemplate() { xlsxReady(_downloadTemplate); }
function _downloadTemplate() {
  if (typeof XLSX !== 'undefined') {
    const headers = ['NAMA','KELAS','TAHUN_AJARAN','NISN','STATUS','SPP',
      'SPP_Jul','SPP_Agt','SPP_Sep','SPP_Okt','SPP_Nov','SPP_Des',
      'SPP_Jan','SPP_Feb','SPP_Mar','SPP_Apr','SPP_Mei','SPP_Jun'];
    const c1a = ['AHMAD FAUZI','7','2023/2024','1234567890','', 450000, 1,1,1,1,1,1, 1,1,1,1,1,1];
    const c1b = ['AHMAD FAUZI','8','2024/2025','1234567890','', 500000, 1,1,1,1,1,0, 0,0,0,0,0,0];
    const c1c = ['AHMAD FAUZI','9','2025/2026','1234567890','Lulus', 600000, 1,0,0,0,0,0, 0,0,0,0,0,0];
    const c2  = ['NAMA SANTRI DUA','8','2024/2025','','Pindah', 500000, 1,1,1,1,1,1, 0,0,0,0,0,0];
    const c3  = ['NAMA SANTRI TIGA','9','2025/2026','','Keluar', 600000, 0,0,0,0,0,0, 0,0,0,0,0,0];
    const wsData = [headers, c1a, c1b, c1c, c2, c3];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      {wch:30},{wch:8},{wch:14},{wch:14},{wch:10},{wch:12},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');
    XLSX.writeFile(wb, 'template_import_santri.xlsx');
    toast('📋 Template Excel berhasil didownload');
  } else {
    const months = 'SPP_Jul,SPP_Agt,SPP_Sep,SPP_Okt,SPP_Nov,SPP_Des,SPP_Jan,SPP_Feb,SPP_Mar,SPP_Apr,SPP_Mei,SPP_Jun';
    const csv = `NAMA,KELAS,TAHUN_AJARAN,NISN,STATUS,SPP,${months}\nAHMAD FAUZI,7,2023/2024,1234567890,,450000,1,1,1,1,1,1,1,1,1,1,1,1\nAHMAD FAUZI,9,2025/2026,1234567890,Lulus,600000,1,0,0,0,0,0,0,0,0,0,0,0\n`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'template_import_santri.csv';
    a.click();
    toast('📋 Template CSV berhasil didownload');
  }
}

// Drag & drop import zone — diinisialisasi setelah DOM siap
document.addEventListener('DOMContentLoaded', () => {
  const importZone = document.getElementById('importZone');
  if (importZone) {
    importZone.addEventListener('dragover', e => { e.preventDefault(); importZone.style.borderColor = 'var(--primary-light)'; importZone.style.background = 'var(--primary-pale)'; });
    importZone.addEventListener('dragleave', () => { importZone.style.borderColor = ''; importZone.style.background = ''; });
    importZone.addEventListener('drop', e => {
      e.preventDefault(); importZone.style.borderColor = ''; importZone.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file) { handleImportFile({files:[file]}); }
    });
  }
});

// ── INIT ──
;// ══ js/import-tunggakan.js ══
// ── SiPay · Import Tunggakan & Riwayat Pembayaran ──
// Memasukkan tunggakan lama (SPP per bulan lintas tahun ajaran + uang pangkal,
// pembangunan, dll) dari file rekap ke dalam aplikasi, sehingga saat petugas
// memilih santri di menu "Input Pembayaran" seluruh tunggakannya langsung
// muncul dan bisa dilunasi/diangsur.
//
// Format yang didukung:
//   1. JSON per santri  — array objek { nama, status, kelas_terakhir,
//      tunggakan_pangkal, tunggakan_pembangunan, tagihan_spp:[ … ] }
//      (mis. DATA_SIPAY.json hasil rekap).
//   2. Baris per bulan  — CSV / XLSX / JSON array dengan kolom
//      nama_santri, tahun_ajaran, kelas, bulan (atau periode), nominal,
//      dibayar, sisa. Opsional: tunggakan_pangkal, tunggakan_pembangunan.
//
// Data masuk ke:
//   • students.spp_history[TA].months  → tunggakan SPP tahun-tahun sebelumnya
//   • students.spp + spp_paid_months   → SPP tahun ajaran berjalan
//   • tagihan (item pangkal/pembangunan/…) → tunggakan non-SPP

// Buffer hasil parsing: array record santri ternormalisasi.
let tgBuffer = [];
// Ringkasan hasil parsing untuk layar pratinjau.
let tgSummary = null;

// Label bawaan item tunggakan non-SPP yang dikenali dari nama kolom/field.
const TG_ITEM_LABEL = {
  pangkal:     'Uang Pangkal',
  pembangunan: 'Uang Pembangunan',
  pendaftaran: 'Uang Pendaftaran',
  buku:        'Uang Buku',
  seragam:     'Uang Seragam',
};

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function tgGoStep(n) {
  [1, 2].forEach(i => {
    const el = document.getElementById('tg_step' + i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

function openImportTunggakanModal() {
  tgBuffer = [];
  tgSummary = null;
  const f = document.getElementById('tgFile');
  if (f) f.value = '';
  tgGoStep(1);
  document.getElementById('importTunggakanModal').classList.add('open');
}

function closeImportTunggakanModal() {
  document.getElementById('importTunggakanModal').classList.remove('open');
}

// ══════════════════════════════════════════
// BACA FILE
// ══════════════════════════════════════════
function handleTunggakanFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();

  if (ext === 'json') {
    reader.onload = e => {
      try { tgIngest(JSON.parse(e.target.result)); }
      catch (err) { toast('⚠️ File JSON tidak valid: ' + err.message); }
    };
    reader.readAsText(file);
  } else if (ext === 'csv' || ext === 'txt') {
    reader.onload = e => tgIngest(tgParseCSV(e.target.result));
    reader.readAsText(file);
  } else {
    // Pustaka Excel ditarik saat dibutuhkan saja (lihat xlsxReady di config.js).
    xlsxReady(() => {
      if (typeof XLSX === 'undefined') {
        toast('⚠️ Library Excel gagal dimuat — gunakan file .csv atau .json');
        return;
      }
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          // Utamakan sheet rincian per bulan bila ada (file rekap punya banyak sheet).
          const name = wb.SheetNames.find(n => /TAGIHAN\s*SPP\s*PER\s*BULAN/i.test(n)) || wb.SheetNames[0];
          tgIngest(XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }));
        } catch (err) { toast('⚠️ Gagal membaca file: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
}

// CSV → array objek. Sadar tanda kutip & BOM, header dinormalisasi ke huruf kecil.
function tgParseCSV(text) {
  const clean = String(text || '').replace(/^﻿/, '').trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/);
  const splitLine = line => {
    const out = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
        else cur += c;
      } else if (c === '"') { quoted = true; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(v => v.trim());
  };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] != null ? cells[idx] : ''; });
    rows.push(obj);
  }
  return rows;
}

// ══════════════════════════════════════════
// NORMALISASI
// ══════════════════════════════════════════
function tgNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const t = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  const n = Number(t);
  return isFinite(n) ? n : 0;
}

// Ambil nilai kolom pertama yang terisi dari beberapa kemungkinan nama kolom.
function tgPick(obj, keys) {
  for (const k of keys) {
    for (const v of [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g, ' '), k.replace(/_/g, ' ').toUpperCase()]) {
      if (obj[v] !== undefined && obj[v] !== '') return obj[v];
    }
  }
  return '';
}

function tgNormKelas(k) {
  const t = String(k == null ? '' : k).trim();
  if (!t || t === '-') return '';
  if (/^VIII/i.test(t)) return '8';
  if (/^IX/i.test(t))   return '9';
  if (/^VII/i.test(t))  return '7';
  if (/^[789]$/.test(t)) return t;
  return t; // kelas non-reguler (mis. "MLZ 1") dipertahankan apa adanya
}

// Status di file rekap → status_kelulusan internal. Kosong = santri aktif.
function tgNormStatus(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t || /^aktif/.test(t)) return '';
  if (/lulus|alumni|selesai|tamat|graduat/.test(t)) return 'lulus';
  if (/keluar|berhenti|mengundurkan|drop/.test(t))  return 'keluar';
  if (/pindah|mutasi|transfer/.test(t))             return 'pindah';
  return '';
}

// Tahun ajaran → "2024/2025". Menerima "2024/2025", "2024-2025", "24/25".
function tgNormTA(v) {
  const t = String(v == null ? '' : v).trim();
  const m = t.match(/(\d{2,4})\s*[\/\-]\s*(\d{2,4})/);
  if (!m) return t;
  const a = m[1].length === 2 ? '20' + m[1] : m[1];
  const b = m[2].length === 2 ? '20' + m[2] : m[2];
  return a + '/' + b;
}

function tgTaStartYear(ta) { return parseInt(String(ta || '').slice(0, 4), 10) || 0; }

// Nominal yang paling sering muncul (dipakai sebagai "SPP/bulan" ringkas).
function tgModus(values) {
  const c = {};
  let best = 0, bestN = -1;
  values.forEach(v => { c[v] = (c[v] || 0) + 1; if (c[v] > bestN) { bestN = c[v]; best = v; } });
  return best;
}

// Record kosong untuk satu santri.
function tgBlank(nama) {
  return { nama, namaFinal: nama, kelas: '', status_kelulusan: '',
           taMasuk: '', taAkhir: '', ta: {}, items: {}, itemsRaw: {} };
}

// Gabungkan satu baris tagihan bulanan ke record santri.
function tgAddMonth(rec, ta, kelas, bulan, nominal, dibayar) {
  if (!ta || !bulan) return;
  const slot = rec.ta[ta] || (rec.ta[ta] = { kelas: '', months: {} });
  if (kelas) slot.kelas = kelas;
  const n = Math.max(0, Math.round(nominal));
  const d = Math.min(n, Math.max(0, Math.round(dibayar)));
  slot.months[bulan] = { n, d };
}

// Terima data mentah (array objek santri ATAU array baris per bulan) → tgBuffer.
function tgIngest(raw) {
  if (!Array.isArray(raw)) {
    // Bungkus umum: { data: [...] } / { santri: [...] }
    raw = (raw && (raw.data || raw.santri || raw.students)) || null;
  }
  if (!Array.isArray(raw) || !raw.length) { toast('⚠️ Tidak ada data yang bisa dibaca dari file'); return; }

  // Dikelompokkan per id santri bila file menyediakannya — dua santri berbeda
  // bisa saja bernama persis sama, dan itu harus tetap terpisah di sini.
  const byKey = new Map();
  const get = (id, nama) => {
    const key = id ? 'id:' + String(id).trim() : 'nm:' + normNama(nama);
    if (!byKey.has(key)) byKey.set(key, tgBlank(nama));
    return byKey.get(key);
  };

  const perSantri = raw.some(r => r && Array.isArray(r.tagihan_spp));

  raw.forEach(row => {
    if (!row || typeof row !== 'object') return;

    if (perSantri) {
      const nama = String(row.nama || row.nama_santri || '').trim().toUpperCase();
      if (!nama) return;
      const rec = get(row.id_santri || row.id, nama);
      rec.nama = nama;
      rec.namaFinal = nama;
      rec.kelas = tgNormKelas(row.kelas_terakhir || row.kelas) || rec.kelas;
      rec.status_kelulusan = tgNormStatus(row.status);
      rec.taMasuk = tgNormTA(row.ta_masuk) || rec.taMasuk;
      rec.taAkhir = tgNormTA(row.ta_terakhir) || rec.taAkhir;
      (row.tagihan_spp || []).forEach(t => {
        const nominal = tgNum(t.nominal);
        const dibayar = t.dibayar !== undefined ? tgNum(t.dibayar) : nominal - tgNum(t.sisa);
        tgAddMonth(rec, tgNormTA(t.tahun_ajaran), tgNormKelas(t.kelas),
          monthCode(t.bulan) || monthCode(t.periode), nominal, dibayar);
      });
      // Setiap field "tunggakan_<item>" jadi tagihan item bernama sama.
      Object.keys(row).forEach(k => {
        const m = k.match(/^tunggakan_(.+)$/i);
        if (!m) return;
        const id = m[1].toLowerCase();
        if (id === 'spp') return; // SPP ditangani lewat tagihan_spp
        rec.itemsRaw[id] = tgNum(row[k]);
      });
      return;
    }

    // Bentuk baris-per-bulan
    const nama = String(tgPick(row, ['nama_santri', 'nama', 'nama_lengkap', 'name']) || '').trim().toUpperCase();
    if (!nama || nama === 'NAMA') return;
    const rec = get(tgPick(row, ['id_santri', 'id']), nama);
    rec.nama = nama;
    rec.namaFinal = nama;
    const kelas = tgNormKelas(tgPick(row, ['kelas', 'class', 'tingkat']));
    const ta    = tgNormTA(tgPick(row, ['tahun_ajaran', 'ta', 'tahun ajaran', 'year']));
    const bulan = monthCode(tgPick(row, ['bulan', 'month'])) || monthCode(tgPick(row, ['periode', 'period']));
    const nominal = tgNum(tgPick(row, ['nominal', 'tagihan', 'jumlah']));
    const sisaRaw = tgPick(row, ['sisa', 'tunggakan']);
    const bayarRaw = tgPick(row, ['dibayar', 'terbayar', 'bayar']);
    const dibayar = bayarRaw !== '' ? tgNum(bayarRaw) : (sisaRaw !== '' ? nominal - tgNum(sisaRaw) : 0);
    if (ta && bulan && nominal > 0) tgAddMonth(rec, ta, kelas, bulan, nominal, dibayar);
    if (kelas && tgTaStartYear(ta) >= tgTaStartYear(rec._lastTA || '')) { rec.kelas = kelas; rec._lastTA = ta; }
    const st = tgNormStatus(tgPick(row, ['status_santri', 'status_kelulusan', 'keterangan_santri']));
    if (st) rec.status_kelulusan = st;
    Object.keys(row).forEach(k => {
      const m = String(k).toLowerCase().replace(/\s+/g, '_').match(/^tunggakan_(.+)$/);
      if (!m || m[1] === 'spp') return;
      const val = tgNum(row[k]);
      if (val) rec.itemsRaw[m[1]] = val;
    });
  });

  tgBuffer = [...byKey.values()].filter(r => Object.keys(r.ta).length || Object.keys(r.itemsRaw).length);
  if (!tgBuffer.length) { toast('⚠️ Tidak ada data tunggakan yang dikenali di file'); return; }

  tgBuild();
  tgRenderPreview();
  tgGoStep(2);
}

// Hitung ringkasan + bersihkan nilai item (negatif = kelebihan bayar → 0).
function tgBuild() {
  const taSet = new Map(); // ta → { sisa, bulan }
  const itemTotal = {};
  const warnNegatif = [];
  let totalSPP = 0;

  tgBuffer.forEach(rec => {
    rec.items = {};
    Object.entries(rec.itemsRaw).forEach(([id, val]) => {
      if (val < 0) { warnNegatif.push(`${rec.nama} — ${TG_ITEM_LABEL[id] || id}: ${rp(val)}`); }
      const v = Math.max(0, Math.round(val));
      rec.items[id] = v;
      if (v > 0) itemTotal[id] = (itemTotal[id] || 0) + v;
    });

    const taKeys = Object.keys(rec.ta).sort((a, b) => tgTaStartYear(a) - tgTaStartYear(b));
    if (!rec.taMasuk && taKeys.length) rec.taMasuk = taKeys[0];
    if (!rec.taAkhir && taKeys.length) rec.taAkhir = taKeys[taKeys.length - 1];

    rec.totalSPP = 0;
    Object.entries(rec.ta).forEach(([ta, slot]) => {
      let sisa = 0, bln = 0;
      Object.values(slot.months).forEach(x => {
        const s = Math.max(0, x.n - x.d);
        if (s > 0) { sisa += s; bln++; }
      });
      rec.totalSPP += sisa;
      const agg = taSet.get(ta) || { sisa: 0, bulan: 0, santri: 0 };
      agg.sisa += sisa; agg.bulan += bln; if (sisa > 0) agg.santri++;
      taSet.set(ta, agg);
    });
    totalSPP += rec.totalSPP;
  });

  const taList = [...taSet.keys()].sort((a, b) => tgTaStartYear(a) - tgTaStartYear(b));
  tgSummary = {
    taList,
    taStat: taSet,
    itemTotal,
    totalSPP,
    warnNegatif,
    duplikat: [],
    curTA: taList.length ? taList[taList.length - 1] : (getProfil().ta || ''),
  };
  tgSummary.duplikat = tgApplyDedup(true);
}

// Satu nama santri = satu baris di database, sementara file rekap bisa memuat
// dua santri berbeda yang namanya persis sama (mis. seorang alumni & seorang
// santri aktif). Fungsi ini menetapkan nama final tiap record:
//   pisah = true  → santri yang masih aktif / paling akhir bersekolah memakai
//                   nama asli, sisanya diberi keterangan angkatan.
//   pisah = false → semua dibiarkan bernama sama sehingga digabung saat disimpan.
// Mengembalikan daftar grup nama kembar untuk ditampilkan sebagai peringatan.
function tgApplyDedup(pisah) {
  const groups = new Map();
  tgBuffer.forEach(r => {
    const k = normNama(r.nama);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const dup = [];
  groups.forEach(list => {
    if (list.length < 2) { list[0].namaFinal = list[0].nama; return; }
    const urut = [...list].sort((a, b) =>
      (a.status_kelulusan ? 1 : 0) - (b.status_kelulusan ? 1 : 0) ||
      tgTaStartYear(b.taAkhir) - tgTaStartYear(a.taAkhir));
    urut.forEach((r, i) => {
      r.namaFinal = (!pisah || i === 0) ? r.nama
        : `${r.nama} (Angkatan ${r.taMasuk || r.taAkhir || (i + 1)})`;
    });
    dup.push({ nama: urut[0].nama, anggota: urut });
  });
  return dup;
}

// ══════════════════════════════════════════
// PRATINJAU
// ══════════════════════════════════════════
function tgRenderPreview() {
  const S = tgSummary;
  // Pertahankan pilihan admin saat panel digambar ulang (ganti TA berjalan).
  const curTA = document.getElementById('tgCurrentTA')?.value || S.curTA;
  const prevProfilTA = document.getElementById('tgSetProfilTA');
  const prevStatus   = document.getElementById('tgSetStatus');
  const keepProfilTA = prevProfilTA ? prevProfilTA.checked : true;
  const keepStatus   = prevStatus ? prevStatus.checked : true;
  const prevTimpa    = document.getElementById('tgTimpaItem');
  const keepTimpa    = prevTimpa ? prevTimpa.checked : false;
  const prevPisah    = document.getElementById('tgPisahDuplikat');
  const pisah        = prevPisah ? prevPisah.checked : true;
  const duplikat     = tgApplyDedup(pisah);

  const targets = tgResolveTargets();
  const mirip = tgBuffer.filter(r => targets.get(r).via === 'mirip');
  const baru  = tgBuffer.filter(r => targets.get(r).via === 'baru').length;
  const cocok = tgBuffer.length - baru;

  // Tunggakan SPP yang akan tercatat sebagai "tahun ajaran sebelumnya"
  let sppPrev = 0, sppCur = 0;
  const sebagianCurTA = [];
  tgBuffer.forEach(rec => Object.entries(rec.ta).forEach(([ta, slot]) => {
    Object.entries(slot.months).forEach(([m, x]) => {
      const sisa = Math.max(0, x.n - x.d);
      if (!sisa) return;
      if (ta === curTA) {
        sppCur += sisa;
        if (x.d > 0) sebagianCurTA.push(`${rec.nama} — ${MONTH_FULL[m]} (sudah ${rp(x.d)} dari ${rp(x.n)})`);
      } else sppPrev += sisa;
    });
  }));

  const itemRows = Object.entries(S.itemTotal)
    .map(([id, tot]) => `<tr><td>${esc(TG_ITEM_LABEL[id] || id)}</td><td class="text-right fw-700 text-danger">${rp(tot)}</td></tr>`)
    .join('');

  const taRows = S.taList.map(ta => {
    const a = S.taStat.get(ta);
    const isCur = ta === curTA;
    return `<tr${isCur ? ' class="row-pale"' : ''}>
      <td>${esc(ta)}${isCur ? ' <span class="fs-12 fw-700 text-primary">TA BERJALAN</span>' : ''}</td>
      <td class="text-right">${a.santri}</td>
      <td class="text-right">${a.bulan}</td>
      <td class="text-right fw-700 ${a.sisa > 0 ? 'text-danger' : 'text-primary-light'}">${rp(a.sisa)}</td>
    </tr>`;
  }).join('');

  const sample = [...tgBuffer].sort((a, b) => (b.totalSPP + tgItemSum(b)) - (a.totalSPP + tgItemSum(a))).slice(0, 25);
  const sampleRows = sample.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${esc(r.namaFinal)}</td>
    <td>${esc(r.kelas || '—')}</td>
    <td>${esc(r.status_kelulusan || 'aktif')}</td>
    <td class="text-right">${rp(r.totalSPP)}</td>
    <td class="text-right">${rp(tgItemSum(r))}</td>
    <td class="text-right fw-700">${rp(r.totalSPP + tgItemSum(r))}</td>
  </tr>`).join('');

  const warnBlocks = [];
  if (duplikat.length) warnBlocks.push(`<div class="bg-danger-pale rounded-8 p-10-12 mt-10 fs-12 lh-16">
    <svg class="ic"><use href="#i-alert"/></svg> <strong>${duplikat.length} nama santri kembar</strong> — di file ini ada santri berbeda dengan nama persis sama.
    Aplikasi menyimpan satu baris per nama, jadi keduanya harus dibedakan atau akan tergabung.
    <div class="mt-6 text-muted">
      ${duplikat.slice(0, 5).map(g => esc(g.nama) + ' → ' +
        g.anggota.map(r => esc(r.namaFinal) + ' (' + esc(r.status_kelulusan || 'aktif') + ', s.d. ' + esc(r.taAkhir || '—') + ')').join(' &nbsp;•&nbsp; ')
      ).join('<br>')}${duplikat.length > 5 ? '<br>…' : ''}
    </div>
    <label class="flex items-center gap-7 mt-8 pointer fw-600">
      <input class="accent-primary w-15 h-15" type="checkbox" id="tgPisahDuplikat"${pisah ? ' checked' : ''} onchange="tgRenderPreview()"
       >
      Pisahkan sebagai santri berbeda (tambahkan keterangan angkatan pada nama)
    </label>
    ${pisah ? '' : '<div class="mt-6 text-danger fw-600">Tanpa dipisah, tunggakan kedua santri akan digabung menjadi satu data.</div>'}
  </div>`);
  if (mirip.length) warnBlocks.push(`<div class="note-yellow">
    <svg class="ic"><use href="#i-alert"/></svg> <strong>${mirip.length} nama dicocokkan berdasarkan kemiripan</strong> (bukan tulisan persis sama).
    Periksa daftar berikut — bila ternyata orang yang berbeda, perbaiki ejaan nama di file lalu import ulang.
    <div class="mt-6 text-muted">
      ${mirip.slice(0, 6).map(r => esc(r.namaFinal) + ' → ' + esc(appState.students[targets.get(r).idx].nama) + ' (' + targets.get(r).skor + '%)').join('<br>')}${mirip.length > 6 ? '<br>…' : ''}
    </div>
  </div>`);
  if (sebagianCurTA.length) warnBlocks.push(`<div class="note-yellow">
    <svg class="ic"><use href="#i-alert"/></svg> <strong>${sebagianCurTA.length} bulan pada TA berjalan terbayar sebagian.</strong>
    Alur SPP tahun berjalan hanya mengenal status lunas/belum per bulan, jadi bulan ini akan
    tercatat <em>belum lunas</em> (nominal penuh). Sesuaikan lewat menu Koreksi bila perlu.
    <div class="mt-6 text-muted">${sebagianCurTA.slice(0, 5).map(esc).join('<br>')}${sebagianCurTA.length > 5 ? '<br>…' : ''}</div>
  </div>`);
  if (S.warnNegatif.length) warnBlocks.push(`<div class="note-yellow">
    <svg class="ic"><use href="#i-alert"/></svg> <strong>${S.warnNegatif.length} nilai tunggakan negatif</strong> (kelebihan bayar) — dianggap <strong>0</strong>.
    <div class="mt-6 text-muted">${S.warnNegatif.slice(0, 5).map(esc).join('<br>')}${S.warnNegatif.length > 5 ? '<br>…' : ''}</div>
  </div>`);

  document.getElementById('tgPreview').innerHTML = `
    <div class="grid cols-4 gap-10 mb-16">
      <div class="stat-box">
        <div class="hint">Santri di file</div>
        <div class="fs-18 fw-800 text-primary">${tgBuffer.length}</div>
        <div class="hint">${cocok} cocok · ${baru} baru</div>
      </div>
      <div class="stat-box">
        <div class="hint">Tunggakan SPP TA lalu</div>
        <div class="fs-18 fw-800 text-danger">${rp(sppPrev)}</div>
      </div>
      <div class="stat-box">
        <div class="hint">SPP TA berjalan belum lunas</div>
        <div class="fs-18 fw-800 text-accent">${rp(sppCur)}</div>
      </div>
      <div class="stat-box">
        <div class="hint">Tunggakan item lain</div>
        <div class="fs-18 fw-800 text-danger">${rp(Object.values(S.itemTotal).reduce((a, b) => a + b, 0))}</div>
      </div>
    </div>

    <div class="form-group mb-14">
      <label>Tahun Ajaran Berjalan</label>
      <select id="tgCurrentTA" onchange="tgRenderPreview()">
        ${S.taList.map(ta =>`<option value="${esc(ta)}"${ta === curTA ? ' selected' : ''}>${esc(ta)}</option>`).join('')}
      </select>
      <div class="fs-12 text-muted mt-5 lh-15">
        TA ini masuk ke alur SPP normal (kolom SPP &amp; bulan dibayar).
        Semua tahun ajaran lain disimpan sebagai <strong>tunggakan SPP tahun ajaran sebelumnya</strong>.
      </div>
    </div>
    <label class="flex items-center gap-7 fs-12-5 mb-6 pointer">
      <input class="accent-primary w-15 h-15" type="checkbox" id="tgSetProfilTA"${keepProfilTA ? ' checked' : ''}>
      Set tahun ajaran madrasah ke <strong>${esc(curTA)}</strong> (Profil Madrasah)
    </label>
    <label class="flex items-center gap-7 fs-12-5 mb-6 pointer">
      <input class="accent-primary w-15 h-15" type="checkbox" id="tgSetStatus"${keepStatus ? ' checked' : ''}>
      Perbarui status santri (aktif / lulus / pindah / keluar) sesuai file
    </label>
    <label class="flex items-start gap-7 fs-12-5 mb-14 pointer">
      <input class="accent-primary w-15 h-15 mt-2" type="checkbox" id="tgTimpaItem"${keepTimpa ? ' checked' : ''}>
      <span>Timpa nominal tagihan item yang <strong>sudah ada</strong> (pangkal, pembangunan, dll)
        <span class="block text-muted fs-12 lh-15">
          Biarkan mati bila ini import ulang: file hanya memuat sisa saat file dibuat, sehingga
          menimpanya akan memunculkan kembali tunggakan yang sudah dilunasi lewat aplikasi.
          Tagihan yang belum ada tetap dibuat.</span></span>
    </label>

    <div class="grid-14-1">
      <div>
        <div class="sub-title mb-6"><svg class="ic"><use href="#i-cal"/></svg> Tunggakan SPP per Tahun Ajaran</div>
        <div class="table-wrap"><table><thead><tr><th>TA</th><th class="text-right">Santri</th><th class="text-right">Bulan</th><th class="text-right">Tunggakan</th></tr></thead>
        <tbody>${taRows}</tbody></table></div>
      </div>
      <div>
        <div class="sub-title mb-6"><svg class="ic"><use href="#i-clip"/></svg> Tunggakan Item Lain</div>
        <div class="table-wrap"><table><thead><tr><th>Item</th><th class="text-right">Total</th></tr></thead>
        <tbody>${itemRows || '<tr><td class="text-muted" colspan="2">Tidak ada</td></tr>'}</tbody></table></div>
      </div>
    </div>

    ${warnBlocks.join('')}

    <div class="section-label-tight"><svg class="ic"><use href="#i-users"/></svg> 25 Tunggakan Terbesar</div>
    <div class="table-wrap mh-280 overflow-y-auto">
      <table><thead><tr><th>#</th><th>Nama</th><th>Kelas</th><th>Status</th>
        <th class="text-right">SPP</th><th class="text-right">Item lain</th><th class="text-right">Total</th></tr></thead>
      <tbody>${sampleRows}</tbody></table>
    </div>`;
}

function tgItemSum(rec) {
  return Object.values(rec.items || {}).reduce((a, b) => a + b, 0);
}

// ══════════════════════════════════════════
// TERAPKAN
// ══════════════════════════════════════════
async function confirmImportTunggakan() {
  if (!tgBuffer.length) { toast('⚠️ Belum ada data untuk diimport'); return; }
  if (!hasAdminSession()) { toast('⚠️ Login sebagai admin dulu untuk menyimpan data'); return; }

  const curTA       = document.getElementById('tgCurrentTA')?.value || tgSummary.curTA;
  const setProfilTA = !!document.getElementById('tgSetProfilTA')?.checked;
  const setStatus   = !!document.getElementById('tgSetStatus')?.checked;
  const pisahDup    = document.getElementById('tgPisahDuplikat')
    ? document.getElementById('tgPisahDuplikat').checked : true;
  const timpaItem   = !!document.getElementById('tgTimpaItem')?.checked;
  tgApplyDedup(pisahDup);

  const btn = document.getElementById('tgConfirmBtn');
  if (btn) { btn.disabled = true; setIconText(btn, '⏳ Menyimpan...'); }
  showSyncIndicator('⏳ Menerapkan data tunggakan...');
  // Tahan sinkronisasi latar belakang selama proses panjang ini: menarik ulang
  // data di tengah jalan bisa membuang perubahan yang belum tersimpan.
  pauseAutoSync();

  let baru = 0, diperbarui = 0;
  const touched = [];
  const tagihanOps = [];
  let itemDitambah = 0;

  // Dipetakan sekali di awal terhadap daftar santri sebelum import, supaya
  // santri baru yang ditambahkan di tengah proses tidak ikut jadi kandidat
  // pencocokan (dan tidak menggeser hasil yang sudah ditentukan).
  const targets = tgResolveTargets();

  try {
    tgBuffer.forEach(rec => {
      const idx = targets.get(rec).idx;
      let s;
      if (idx >= 0) { s = appState.students[idx]; diperbarui++; }
      else {
        s = { nama: rec.namaFinal, kelas: rec.kelas || '', nisn: '', spp: 0,
              spp_paid_months: [], spp_history: {}, status_kelulusan: '' };
        appState.students.push(s);
        baru++;
      }

      if (rec.kelas) s.kelas = rec.kelas;
      if (setStatus) s.status_kelulusan = rec.status_kelulusan || '';
      s.spp_history = (s.spp_history && typeof s.spp_history === 'object' && !Array.isArray(s.spp_history))
        ? s.spp_history : {};

      Object.entries(rec.ta).forEach(([ta, slot]) => {
        if (ta === curTA) {
          const nominals = Object.values(slot.months).map(x => x.n).filter(n => n > 0);
          if (nominals.length) s.spp = tgModus(nominals);
          // Gabung dengan bulan yang sudah tercatat lunas di aplikasi supaya
          // pembayaran yang masuk setelah file dibuat tidak ikut terhapus.
          const lunas = Object.keys(slot.months).filter(m => slot.months[m].n - slot.months[m].d <= 0);
          s.spp_paid_months = MONTHS.filter(m => lunas.includes(m) || (s.spp_paid_months || []).includes(m));
        } else {
          s.spp_history[ta] = tgMergeHistory(s.spp_history[ta], slot);
        }
      });

      Object.entries(rec.items).forEach(([itemId, sisaTarget]) => {
        const target = Math.max(0, Math.round(sisaTarget));
        const ex = findTagihan(s.nama, itemId);
        if (ex) {
          // Tagihan item sudah ada. File hanya memuat SISA saat file dibuat,
          // jadi menyetel ulang nominal setelah ada pembayaran akan
          // "menghidupkan" tunggakan yang sudah lunas — hanya dilakukan bila
          // admin memang meminta penimpaan.
          if (!timpaItem) return;
          const paid = Math.max(0, ex.paid_amount || 0);
          const nominal = paid + target;
          if (nominal !== (ex.nominal || 0)) {
            tagihanOps.push({ id: ex.id, nama: s.nama, kelas: s.kelas, item_id: itemId,
              item_name: ex.item_name, nominal, paid_amount: paid });
          }
        } else if (target > 0) {
          if (tgEnsurePayItem(itemId)) itemDitambah++;
          tagihanOps.push({ nama: s.nama, kelas: s.kelas, item_id: itemId,
            item_name: tgItemName(itemId), nominal: target, paid_amount: 0 });
        }
      });

      touched.push(s);
    });

    appState.students.sort((a, b) => a.nama.localeCompare(b.nama));

    // Simpan bertahap agar payload tiap request tetap wajar.
    for (let i = 0; i < touched.length; i += 50) {
      await saveStudentsBatch(touched.slice(i, i + 50));
      showSyncIndicator(`⏳ Menyimpan santri ${Math.min(i + 50, touched.length)}/${touched.length}...`);
    }
    for (let i = 0; i < tagihanOps.length; i += 100) {
      await upsertTagihanBatch(tagihanOps.slice(i, i + 100));
      showSyncIndicator(`⏳ Menyimpan tagihan ${Math.min(i + 100, tagihanOps.length)}/${tagihanOps.length}...`);
    }
    if (itemDitambah) await saveSettings();

    if (setProfilTA && curTA) {
      const p = getProfil();
      p.ta = curTA;
      localStorage.setItem('sipay_profil', JSON.stringify(p));
      await saveSettings();
    }

    showSyncIndicator('✅ Data tunggakan tersimpan', 2500);
    closeImportTunggakanModal();
    renderSiswaTable(); renderTunggakan(); renderDashboard();
    if (typeof renderItemList === 'function') renderItemList();
    toast(`✅ Import tunggakan: ${baru} santri baru, ${diperbarui} diperbarui, ${tagihanOps.length} tagihan item`);
  } catch (e) {
    console.error('confirmImportTunggakan error:', e);
    showSyncIndicator('⚠️ Gagal menyimpan: ' + e.message, 4000);
    toast('⚠️ Gagal menyimpan data tunggakan — cek koneksi lalu ulangi');
  } finally {
    resumeAutoSync();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#i-save"/></svg> Terapkan ke Aplikasi'; }
  }
}

// Gabungkan entri spp_history lama dengan data dari file. Bulan dianggap sudah
// dibayar bila SALAH SATU sumber menyatakan demikian — import tidak boleh
// "menghidupkan kembali" tunggakan yang sudah dilunasi lewat aplikasi.
function tgMergeHistory(existing, slot) {
  const ex     = (existing && typeof existing === 'object') ? existing : null;
  const exRich = (ex && ex.months && typeof ex.months === 'object' && !Array.isArray(ex.months)) ? ex.months : null;
  const exPaid = (ex && Array.isArray(ex.spp_paid_months)) ? ex.spp_paid_months : [];
  const exRate = ex ? (Number(ex.spp) || 0) : 0;

  const months = {};
  MONTHS.forEach(m => {
    const inc = slot.months[m];
    const old = exRich ? exRich[m] : (exRate > 0 ? { n: exRate, d: exPaid.includes(m) ? exRate : 0 } : null);
    if (!inc && !old) return;
    const n = inc ? inc.n : old.n;
    let d = Math.max(inc ? inc.d : 0, old ? old.d : 0);
    if (!exRich && exPaid.includes(m)) d = n; // bentuk ringkas: lunas = penuh
    months[m] = { n, d: Math.min(n, d) };
  });

  const nominals = Object.values(months).map(x => x.n).filter(n => n > 0);
  return {
    spp: nominals.length ? tgModus(nominals) : exRate,
    spp_paid_months: Object.keys(months).filter(m => months[m].n - months[m].d <= 0),
    kelas: slot.kelas || (ex && ex.kelas) || '',
    months,
  };
}

// Petakan tiap record di file ke santri yang sudah terdaftar.
// Pencocokan persis dijalankan lebih dulu untuk SEMUA record, baru sisanya
// dicoba lewat kemiripan nama — dan satu santri lama hanya boleh diklaim oleh
// satu record. Tanpa aturan ini, dua santri berbeda yang namanya mirip
// (mis. kakak-adik) akan tergabung menjadi satu data.
// Mengembalikan Map: record → { idx, via: 'persis' | 'mirip' | 'baru', skor }.
function tgResolveTargets() {
  const existing = appState.students;
  const claimed = new Set();
  const hasil = new Map();
  const sisa = [];

  tgBuffer.forEach(rec => {
    const norm = normNama(rec.namaFinal);
    let idx = -1;
    for (let i = 0; i < existing.length; i++) {
      if (!claimed.has(i) && normNama(existing[i].nama) === norm) { idx = i; break; }
    }
    if (idx >= 0) { claimed.add(idx); hasil.set(rec, { idx, via: 'persis' }); }
    else sisa.push(rec);
  });

  sisa.forEach(rec => {
    let best = -1, bestScore = 0;
    for (let i = 0; i < existing.length; i++) {
      if (claimed.has(i)) continue;
      const sc = nameSimilarity(rec.namaFinal, existing[i].nama);
      if (sc >= 0.85 && sc > bestScore) { best = i; bestScore = sc; }
    }
    if (best >= 0) { claimed.add(best); hasil.set(rec, { idx: best, via: 'mirip', skor: Math.round(bestScore * 100) }); }
    else hasil.set(rec, { idx: -1, via: 'baru' });
  });

  return hasil;
}

function tgItemName(itemId) {
  const def = appState.payItems.find(i => i.id === itemId);
  if (def) return def.name;
  return TG_ITEM_LABEL[itemId] || ('Uang ' + itemId.charAt(0).toUpperCase() + itemId.slice(1));
}

// Pastikan definisi item ada di "Kelola Item Bayar" agar bisa dikelola admin.
// Dibuat nonaktif: tagihan yang bersisa tetap muncul di Input Pembayaran lewat
// jalur tunggakan, jadi item ini tidak memenuhi form santri yang tak punya tagihan.
function tgEnsurePayItem(itemId) {
  if (appState.payItems.find(i => i.id === itemId)) return false;
  appState.payItems.push({
    id: itemId, name: TG_ITEM_LABEL[itemId] || tgItemName(itemId),
    amount: 0, type: 'tetap', active: false, kelas: ['7', '8', '9'],
  });
  return true;
}

// ── Drag & drop + klik latar untuk menutup ──
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('importTunggakanModal');
  if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeImportTunggakanModal(); });

  const zone = document.getElementById('tgZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary-light)';
    zone.style.background = 'var(--primary-pale)';
  });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; zone.style.background = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = ''; zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) handleTunggakanFile({ files: [file] });
  });
});

// ── AUTH ──
;// ══ js/tunggakan-lama.js ══
// ── SiPay · Editor Tunggakan SPP Tahun Ajaran Sebelumnya ──
// Menyunting `students.spp_history` satu santri langsung dari aplikasi, tanpa
// harus lewat file di menu "Import Tunggakan". Dipakai untuk:
//   • memasukkan tunggakan TA lama santri yang datanya belum pernah diimport,
//   • membetulkan nominal/bulan yang keliru,
//   • memulihkan riwayat yang terlanjur terhapus.
//
// Bentuk data yang ditulis selalu bentuk RINCI (lihat sppHistMonths di
// helpers.js), yaitu per bulan { n: nominal ditagih, d: nominal dibayar },
// karena hanya bentuk itu yang sanggup menyimpan nominal berbeda antar bulan
// dan pembayaran sebagian. `spp` (nominal acuan), `kelas`, dan
// `spp_paid_months` (daftar bulan lunas) tetap ikut ditulis agar kode lama yang
// membaca bentuk ringkas — mis. halaman Periksa & Pulihkan Data — tetap jalan.

let thNama     = '';   // santri yang sedang disunting
let thDraft    = [];   // [{ ta, kelas, rate, months: { Jul: { tagih, n, d }, … } }]
let thBaseline = '';   // snapshot JSON spp_history saat modal dibuka

// ══════════════════════════════════════════
// KONVERSI DATA ⇄ DRAFT
// ══════════════════════════════════════════

function thBlankMonths() {
  const map = {};
  MONTHS.forEach(m => { map[m] = { tagih: false, n: 0, d: 0 }; });
  return map;
}

// Satu entri spp_history → baris draft. sppHistMonths() sudah menormalkan
// bentuk ringkas maupun rinci, jadi keduanya masuk lewat jalur yang sama.
function thRecToRow(ta, rec) {
  const months = thBlankMonths();
  sppHistMonths(rec).forEach(x => { months[x.m] = { tagih: true, n: x.nominal, d: x.dibayar }; });
  return {
    ta,
    kelas: String((rec && rec.kelas) || ''),
    rate:  Number((rec && rec.spp) || 0),
    months,
  };
}

function thHistToDraft(hist) {
  return Object.keys(hist || {})
    .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
    .map(ta => thRecToRow(ta, hist[ta]));
}

// Draft → objek spp_history siap simpan. Bulan yang tidak dicentang "ditagih"
// tidak ikut ditulis (artinya: TA itu memang tidak menagih bulan tersebut).
function thDraftToHist(draft) {
  const hist = {};
  draft.forEach(y => {
    const months = {};
    const lunas  = [];
    MONTHS.forEach(m => {
      const c = y.months[m];
      if (!c || !c.tagih) return;
      const n = Math.max(0, Math.round(Number(c.n) || 0));
      const d = Math.min(n, Math.max(0, Math.round(Number(c.d) || 0)));
      months[m] = { n, d };
      if (d >= n) lunas.push(m);
    });
    hist[thNormTA(y.ta)] = {
      spp: Math.max(0, Math.round(Number(y.rate) || 0)),
      kelas: String(y.kelas || '').trim(),
      spp_paid_months: lunas,
      months,
    };
  });
  return hist;
}

// Normalisasi label TA jadi "YYYY/YYYY". Return '' bila tidak sah.
function thNormTA(v) {
  const m = String(v || '').match(/^\s*(\d{4})\s*[\/\-]\s*(\d{4})\s*$/);
  if (!m) return '';
  return `${m[1]}/${m[2]}`;
}

// Santri yang sedang disunting masih menagih SPP tahun berjalan? Bila ya, entri
// riwayat berlabel TA berjalan (atau sesudahnya) membuat tahun yang sama
// terhitung dua kali — di editor ditandai dan ditolak saat simpan.
// Santri LULUS dikecualikan: SPP tahun berjalannya memang sudah diarsipkan.
function thBentrokDicek() {
  const s = appState.students.find(x => x.nama === thNama);
  return !s || s.status_kelulusan !== 'lulus';
}

function thTaBentrok(ta) {
  return thBentrokDicek() && typeof isTaBerjalanAtauSesudah === 'function' && isTaBerjalanAtauSesudah(ta);
}

function thWarnHTML(y) {
  if (!thTaBentrok(y.ta)) return '';
  const taBerjalan = (typeof getProfil === 'function') ? (getProfil().ta || '') : '';
  return `<div class="bg-danger-pale border-1-5-danger rounded-9 p-8-12 fs-12 text-danger fw-600 mb-10">
    <svg class="ic"><use href="#i-alert"/></svg> TA ${esc(y.ta)} sama dengan tahun ajaran berjalan${taBerjalan ? ` (${esc(taBerjalan)})` : ''} atau sesudahnya.
    <span class="fw-500">Tahun berjalan sudah ditagih lewat SPP biasa, jadi baris ini tidak dihitung sebagai tunggakan TA lalu —
    kalau dihitung, nominalnya jadi ganda. Perbaiki labelnya menjadi tahun ajaran yang sudah lewat, atau hapus baris ini.</span>
  </div>`;
}

function thRowTotals(y) {
  let tagihan = 0, dibayar = 0, bulan = 0, menunggak = 0;
  MONTHS.forEach(m => {
    const c = y.months[m];
    if (!c || !c.tagih) return;
    const n = Math.max(0, Number(c.n) || 0);
    const d = Math.min(n, Math.max(0, Number(c.d) || 0));
    tagihan += n; dibayar += d; bulan++;
    if (n - d > 0) menunggak++;
  });
  return { tagihan, dibayar, sisa: tagihan - dibayar, bulan, menunggak };
}

// ══════════════════════════════════════════
// BUKA / TUTUP
// ══════════════════════════════════════════

async function openTunggakanLamaModal(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) { toast('⚠️ Data santri tidak ditemukan!'); return; }

  thNama = nama;
  document.getElementById('thNamaLabel').textContent = `${nama} — ${kelasLabel(s)}`;
  document.getElementById('thBody').innerHTML =
    '<div class="text-center text-muted p-32 fs-13">Memuat riwayat...</div>';
  document.getElementById('tunggakanLamaModal').classList.add('open');

  // Selalu mulai dari kondisi server, bukan salinan memori — supaya input dari
  // device lain tidak tertimpa tanpa sadar.
  let hist;
  try {
    hist = await loadSppHistory(nama);
  } catch (e) {
    document.getElementById('thBody').innerHTML =
      `<div class="text-danger fs-13 p-16">Gagal memuat: ${esc(e.message)}</div>`;
    return;
  }
  if (hist == null) {
    // Baris santri belum ada di server (mis. baru ditambah & gagal tersimpan).
    hist = (s.spp_history && typeof s.spp_history === 'object' && !Array.isArray(s.spp_history)) ? s.spp_history : {};
  }
  thBaseline = JSON.stringify(hist);
  thDraft    = thHistToDraft(hist);
  thRender();
}

// Dipanggil dari modal "Edit Data Santri". Kedua modal tidak boleh terbuka
// bersamaan, jadi modal edit ditutup dulu — dan karena penutupan itu membuang
// isian yang belum disimpan, perubahan yang belum sempat disimpan dikonfirmasi.
function openTunggakanLamaFromEdit() {
  const nama = document.getElementById('ed_original_nama').value;
  const s = appState.students.find(x => x.nama === nama);
  if (!s) { toast('⚠️ Data santri tidak ditemukan!'); return; }
  const berubah =
    document.getElementById('ed_nama').value.trim().toUpperCase() !== s.nama ||
    document.getElementById('ed_nisn').value.trim() !== (s.nisn || '') ||
    document.getElementById('ed_kelas').value !== String(s.kelas) ||
    (Number(document.getElementById('ed_spp').value) || 0) !== (s.spp || 0);
  if (berubah && !confirm('Perubahan pada form Edit Data Santri belum disimpan dan akan dibatalkan.\n\nLanjut ke pengaturan tunggakan TA sebelumnya?')) return;
  document.getElementById('editSiswaModal').classList.remove('open');
  openTunggakanLamaModal(nama);
}

function closeTunggakanLamaModal() {
  document.getElementById('tunggakanLamaModal').classList.remove('open');
  thNama = ''; thDraft = []; thBaseline = '';
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════

function thRender() {
  const body = document.getElementById('thBody');
  if (!thDraft.length) {
    body.innerHTML = `
      <div class="empty-dashed">
        <div class="fs-13 text-muted mb-12">
          Belum ada riwayat tahun ajaran sebelumnya untuk santri ini.
        </div>
        <button class="btn btn-primary btn-sm" onclick="thAddTA()"><svg class="ic"><use href="#i-plus"/></svg> Tambah Tahun Ajaran</button>
      </div>`;
    thRenderFooter();
    return;
  }
  body.innerHTML = thDraft.map((y, i) => `<div id="th_card_${i}">${thCardHTML(y, i)}</div>`).join('') + `
    <div class="text-center mt-4">
      <button class="btn btn-outline btn-sm" onclick="thAddTA()"><svg class="ic"><use href="#i-plus"/></svg> Tambah Tahun Ajaran</button>
    </div>`;
  thRenderFooter();
}

function thCardHTML(y, i) {
  const t = thRowTotals(y);
  const monthRows = MONTHS.map(m => {
    const c = y.months[m];
    const off = !c.tagih;
    return `<div class="th-month-row${off ? ' is-off' : ''}">
      <label class="flex items-center gap-6 fs-12-5 fw-600 pointer">
        <input class="accent-primary w-15 h-15" type="checkbox" ${c.tagih ? 'checked' : ''} onchange="thToggleMonth(${i},'${m}',this.checked)"
         >
        ${MONTH_FULL[m]}
      </label>
      <input class="p-5-8 border-1-5-border rounded-7 fs-12-5 font-inherit w-full" type="number" min="0" step="1000" value="${c.tagih ? c.n : ''}" ${off ? 'disabled' : ''}
        placeholder="nominal" oninput="thSetMonth(${i},'${m}','n',this.value)"
       >
      <input class="p-5-8 border-1-5-border rounded-7 fs-12-5 font-inherit w-full" type="number" min="0" step="1000" value="${c.tagih ? c.d : ''}" ${off ? 'disabled' : ''}
        placeholder="dibayar" oninput="thSetMonth(${i},'${m}','d',this.value)"
       >
    </div>`;
  }).join('');

  return `<div class="border-1-5-border rounded-12 p-14 mb-12 bg-card">
    <div id="th_warn_${i}">${thWarnHTML(y)}</div>
    <div class="th-ta-grid">
      <div class="form-group m-0">
        <label>Tahun Ajaran <span class="text-danger">*</span></label>
        <input type="text" value="${esc(y.ta)}" placeholder="2024/2025" oninput="thSetField(${i},'ta',this.value)">
      </div>
      <div class="form-group m-0">
        <label>Kelas saat itu</label>
        <input type="text" value="${esc(y.kelas)}" placeholder="mis. 8" oninput="thSetField(${i},'kelas',this.value)">
      </div>
      <div class="form-group m-0">
        <label>SPP per Bulan (Rp)</label>
        <input type="number" min="0" step="1000" value="${y.rate || ''}" placeholder="0" oninput="thSetField(${i},'rate',this.value)">
      </div>
      <button class="btn btn-danger btn-sm act-del" onclick="thRemoveTA(${i})" title="Hapus tahun ajaran ini"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>
    </div>

    <div class="flex gap-6 flex-wrap mb-10">
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'tagih12')" title="Centang 12 bulan & isi nominalnya dengan SPP per bulan"><svg class="ic"><use href="#i-pin"/></svg> Tagih 12 bulan</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'ratakan')" title="Samakan nominal semua bulan yang ditagih dengan SPP per bulan"><svg class="ic"><use href="#i-refresh"/></svg> Samakan nominal</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'lunas')"><svg class="ic"><use href="#i-check"/></svg> Semua lunas</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'belum')"><svg class="ic"><use href="#i-x"/></svg> Semua belum bayar</button>
    </div>

    <div class="th-head-grid">
      <div>Bulan ditagih</div><div>Nominal (Rp)</div><div>Sudah dibayar (Rp)</div>
    </div>
    ${monthRows}

    <div class="mt-10" id="th_sum_${i}">${thSummaryHTML(t)}</div>
  </div>`;
}

function thSummaryHTML(t) {
  if (!t.bulan) {
    return `<div class="bg-danger-pale rounded-9 p-8-12 fs-12 text-danger fw-600">
      <svg class="ic"><use href="#i-alert"/></svg> Belum ada bulan yang ditagih — centang minimal 1 bulan, atau hapus tahun ajaran ini.
    </div>`;
  }
  return `<div class="bg-bg rounded-9 p-8-12 flex gap-16 flex-wrap fs-12">
    <span>Ditagih: <strong>${t.bulan} bln</strong></span>
    <span>Tagihan: <strong>${rp(t.tagihan)}</strong></span>
    <span>Terbayar: <strong class="text-primary-light">${rp(t.dibayar)}</strong></span>
    <span>Sisa: <strong class="${t.sisa > 0 ? 'text-danger' : 'text-primary-light'}">${t.sisa > 0 ? rp(t.sisa) + ` (${t.menunggak} bln)` : '<svg class="ic"><use href="#i-check"/></svg> Lunas'}</strong></span>
  </div>`;
}

function thRenderFooter() {
  const total = thDraft.reduce((a, y) => a + thRowTotals(y).sisa, 0);
  const el = document.getElementById('thTotal');
  if (el) el.innerHTML = thDraft.length
    ? `Total tunggakan TA sebelumnya: <strong class="${total > 0 ? 'text-danger' : 'text-primary-light'}">${rp(total)}</strong>`
    : '';
}

// Perbarui hanya ringkasan kartu (tanpa render ulang) supaya fokus & posisi
// kursor di kolom nominal tidak hilang saat mengetik.
function thTouch(i) {
  const el = document.getElementById('th_sum_' + i);
  if (el) el.innerHTML = thSummaryHTML(thRowTotals(thDraft[i]));
  thRenderFooter();
}

// ══════════════════════════════════════════
// AKSI
// ══════════════════════════════════════════

function thAddTA() {
  // Tebakan label: satu tahun sebelum TA yang paling awal tercatat, atau satu
  // tahun sebelum TA berjalan bila belum ada entri sama sekali.
  const tahunAcuan = thDraft.length
    ? Math.min(...thDraft.map(y => parseInt(y.ta) || 9999))
    : (parseInt(getProfil().ta) || new Date().getFullYear());
  const awal = tahunAcuan - 1;
  const s = appState.students.find(x => x.nama === thNama);
  thDraft.push({ ta: `${awal}/${awal + 1}`, kelas: '', rate: (s && s.spp) || 0, months: thBlankMonths() });
  thDraft.sort((a, b) => (parseInt(a.ta) || 0) - (parseInt(b.ta) || 0));
  thRender();
}

function thRemoveTA(i) {
  const y = thDraft[i];
  if (!y) return;
  const t = thRowTotals(y);
  // Hanya konfirmasi bila ada isinya — kartu kosong yang baru ditambah langsung dibuang.
  if (t.bulan && !confirm(`Hapus seluruh riwayat TA ${y.ta} milik ${thNama}?\n\n` +
      `${t.bulan} bulan ditagih · sisa tunggakan ${rp(t.sisa)}\n\n` +
      `Data ini tidak bisa dipulihkan otomatis.`)) return;
  thDraft.splice(i, 1);
  thRender();
}

function thSetField(i, field, val) {
  const y = thDraft[i];
  if (!y) return;
  if (field === 'rate') y.rate = Math.max(0, Number(val) || 0);
  else y[field] = val;
  // Peringatan "TA bentrok" ikut label yang sedang diketik — hanya blok
  // peringatannya yang digambar ulang supaya kursor tidak lompat.
  if (field === 'ta') {
    const w = document.getElementById('th_warn_' + i);
    if (w) w.innerHTML = thWarnHTML(y);
  }
}

function thToggleMonth(i, m, on) {
  const y = thDraft[i];
  if (!y) return;
  const c = y.months[m];
  c.tagih = !!on;
  // Baru dicentang & nominalnya masih kosong → isi dengan SPP per bulan.
  if (c.tagih && !c.n) c.n = Math.max(0, Number(y.rate) || 0);
  // Render ulang kartu: status disabled kolom nominal ikut berubah.
  const card = document.getElementById('th_card_' + i);
  if (card) card.innerHTML = thCardHTML(y, i);
  thRenderFooter();
}

function thSetMonth(i, m, field, val) {
  const y = thDraft[i];
  if (!y) return;
  y.months[m][field] = Math.max(0, Number(val) || 0);
  thTouch(i);
}

function thQuick(i, aksi) {
  const y = thDraft[i];
  if (!y) return;
  const rate = Math.max(0, Number(y.rate) || 0);
  if (aksi === 'tagih12' && rate <= 0) { toast('⚠️ Isi "SPP per Bulan" dulu.'); return; }
  MONTHS.forEach(m => {
    const c = y.months[m];
    if (aksi === 'tagih12') { c.tagih = true; c.n = rate; }
    else if (!c.tagih) return;
    else if (aksi === 'ratakan') c.n = rate;
    else if (aksi === 'lunas')  c.d = Math.max(0, Number(c.n) || 0);
    else if (aksi === 'belum')  c.d = 0;
  });
  const card = document.getElementById('th_card_' + i);
  if (card) card.innerHTML = thCardHTML(y, i);
  thRenderFooter();
}

// ══════════════════════════════════════════
// SIMPAN
// ══════════════════════════════════════════

async function saveTunggakanLama() {
  const nama = thNama;
  if (!nama) return;

  // ── Validasi ──
  const terpakai = new Set();
  for (let i = 0; i < thDraft.length; i++) {
    const y  = thDraft[i];
    const ta = thNormTA(y.ta);
    if (!ta) { toast(`⚠️ Tahun ajaran #${i + 1} ("${y.ta}") tidak sah — tulis dengan format 2024/2025.`); return; }
    const [a, b] = ta.split('/').map(Number);
    if (b !== a + 1) { toast(`⚠️ TA ${ta} tidak berurutan — tahun kedua harus ${a + 1}.`); return; }
    if (terpakai.has(ta)) { toast(`⚠️ TA ${ta} ditulis dua kali — gabungkan jadi satu kartu.`); return; }
    if (thTaBentrok(ta)) {
      toast(`⚠️ TA ${ta} adalah tahun ajaran berjalan — tagihannya sudah masuk SPP tahun berjalan. `
        + 'Ubah labelnya ke tahun ajaran yang sudah lewat, atau hapus kartunya.', 6000);
      return;
    }
    terpakai.add(ta);
    y.ta = ta;
    if (!thRowTotals(y).bulan) {
      toast(`⚠️ TA ${ta} belum punya bulan yang ditagih — centang bulannya, atau hapus kartunya.`);
      return;
    }
  }

  const hist = thDraftToHist(thDraft);

  // ── Deteksi bentrok antar device ──
  // Riwayat ini ditimpa utuh, jadi bila ada yang menyuntingnya dari device lain
  // sejak modal dibuka, jangan diam-diam menimpa: muat ulang & minta periksa.
  let server;
  try {
    server = await loadSppHistory(nama);
  } catch (e) { toast('⚠️ Gagal memeriksa data terbaru: ' + e.message); return; }
  if (server != null && JSON.stringify(server) !== thBaseline) {
    thBaseline = JSON.stringify(server);
    thDraft    = thHistToDraft(server);
    thRender();
    toast('⚠️ Data berubah di perangkat lain — isian dimuat ulang. Periksa lalu simpan lagi.', 5000);
    return;
  }

  try {
    await saveSppHistory(nama, hist);
  } catch (e) { toast('⚠️ Gagal menyimpan: ' + e.message, 4000); return; }

  closeTunggakanLamaModal();

  // Segarkan semua tampilan yang membaca spp_history.
  const s = appState.students.find(x => x.nama === nama);
  if (typeof renderSiswaTable === 'function') renderSiswaTable();
  if (typeof renderTunggakan  === 'function') renderTunggakan();
  if (typeof renderDashboard  === 'function') renderDashboard();
  const detailEl = document.getElementById('tunggakanDetail');
  if (detailEl && detailEl.innerHTML && s && typeof renderTunggakanDetail === 'function') renderTunggakanDetail(s);
  // Form Input Pembayaran: bila santri ini sedang dipilih, blok tunggakan TA
  // lama harus ikut terbarui.
  const inputNama = document.getElementById('inputNama');
  if (inputNama && inputNama.value === nama && typeof renderPaymentItems === 'function') renderPaymentItems(s);

  const total = sppTunggakanPrev(s || { spp_history: hist });
  toast(total > 0
    ? `✅ Riwayat ${nama} tersimpan — tunggakan TA sebelumnya ${rp(total)}`
    : `✅ Riwayat ${nama} tersimpan — tidak ada tunggakan TA sebelumnya`);
}

document.addEventListener('DOMContentLoaded', () => {
  const ov = document.getElementById('tunggakanLamaModal');
  if (ov) ov.addEventListener('click', function(e) { if (e.target === this) closeTunggakanLamaModal(); });
});
;// ══ js/auth.js ══
// ── SiPay · Auth & Login ──
// ══════════════════════════════════════════
// AUTH / LOGIN
// ══════════════════════════════════════════
// Kredensial admin kini di Supabase Auth (bukan localStorage). DEFAULT_ADMIN
// hanya menyediakan label nama untuk UI sebelum profil termuat.
const DEFAULT_ADMIN = { user: 'Admin' };

function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem('sipay_admin') || 'null') || DEFAULT_ADMIN; }
  catch { return DEFAULT_ADMIN; }
}
// Login admin = punya sesi Supabase Auth yang valid (ditegakkan server via RLS),
// bukan sekadar penanda di localStorage.
function isLoggedIn() {
  return hasAdminSession();
}
function showLoginError(msg) {
  const err = document.getElementById('loginError');
  setIconText(err, '⚠️ ' + msg);
  err.style.display = 'block';
  setTimeout(() => err.style.display = 'none', 4000);
}

// Login admin via Supabase Auth (email + password).
async function doLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) { showLoginError('Email & password wajib diisi'); return; }

  const btn = document.querySelector('#loginFormAdmin .login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    const sess = await sbSignIn(email, pass);
    // Akun yang tidak ada di daftar admin (mis. hasil pendaftaran publik) ditolak
    // di sini supaya tidak melihat layar kosong. Penjaga utamanya tetap RLS server.
    let admin = true;
    try { admin = (await sb('rpc/is_admin', 'POST', {})) !== false; } catch { /* migrasi belum dijalankan */ }
    if (!admin) {
      await sbSignOut();
      showLoginError('Akun ini belum terdaftar sebagai admin SiPay');
      document.getElementById('loginPass').value = '';
      return;
    }
    const label = (sess.user && sess.user.email) ? sess.user.email : email;
    localStorage.setItem('sipay_admin', JSON.stringify({ user: label }));
    localStorage.setItem('sipay_auth', 'admin'); // penanda UI (otoritas ada di token)
    localStorage.removeItem('sipay_guest');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = label;
    // Muat ulang data dengan hak akses admin (token kini terpasang di sb())
    try { await loadDataForTA(); } catch { /* biarkan; UI tetap tampil */ }
    startAutoSync(); // jaga layar tetap pada kondisi data terakhir
    showPage('dashboard');
  } catch (e) {
    showLoginError('Email atau password salah');
    document.getElementById('loginPass').value = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}
// ══════════════════════════════════════════
;// ══ js/guest.js ══
// ── SiPay · Mode Tamu / Orang Tua ──
// MODE PENGUNJUNG — tanpa pemisahan tahun ajaran
// ══════════════════════════════════════════

function openLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.add('show');
}
function closeLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.remove('show');
}
async function doLogout() {
  closeLogoutConfirm();
  stopAutoSync();                  // hentikan polling data setelah keluar
  await sbSignOut();               // revoke & hapus token admin (bila ada)
  localStorage.removeItem('sipay_auth');
  localStorage.removeItem('sipay_guest');
  clearLocalData();                // hapus salinan data santri & kontak admin
  guestData = { siswa: null, txns: [] };
  showPage('dashboard');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginScreen').classList.remove('hidden');
  setTimeout(() => document.getElementById('loginUser').focus(), 100);
}

async function testGasConnection() {
  const url = document.getElementById('gasUrlInput').value.trim();
  const res = document.getElementById('gasTestResult');
  if (!url) { res.innerHTML = '<span class="text-danger"><svg class="ic"><use href="#i-alert"/></svg> Isi URL dulu</span>'; return; }
  res.innerHTML = '<svg class="ic"><use href="#i-clock"/></svg> Testing...';
  try {
    const r = await fetch(url + '?action=ping');
    const data = await r.json();
    if (data.ok) {
      res.innerHTML = `<span class="text-primary-light"><svg class="ic"><use href="#i-check"/></svg> Koneksi berhasil! Server time: ${data.time}</span>`;
    } else {
      res.innerHTML = `<span class="text-danger"><svg class="ic"><use href="#i-x"/></svg> Respons tidak valid: ${JSON.stringify(data)}</span>`;
    }
  } catch(e) {
    res.innerHTML = `<span class="text-danger"><svg class="ic"><use href="#i-x"/></svg> Gagal: ${e.message}</span>`;
  }
}

function saveGasUrl() {
  const url = document.getElementById('gasUrlInput').value.trim();
  if (!url) { toast('⚠️ URL tidak boleh kosong'); return; }
  localStorage.setItem('sipay_gas_url', url);
  document.getElementById('gasSetupModal').classList.remove('open');
  toast('✅ URL berhasil disimpan!');
}

// ══════════════════════════════════════════
;// ══ js/akun.js ══
// ── SiPay · Akun Admin ──
// AKUN ADMIN
// ══════════════════════════════════════════
// Data akun untuk tampilan (nama, email kontak, hp). Password TIDAK lagi
// disimpan di sini — kredensial dikelola Supabase Auth.
function getAkunData() {
  try { return JSON.parse(localStorage.getItem('sipay_akun') || 'null') || { user:'Admin', email:'', hp:'' }; }
  catch { return { user:'Admin', email:'', hp:'' }; }
}
async function saveAkunData(data) {
  const clean = { user: data.user || 'Admin', email: data.email || '', hp: data.hp || '' };
  localStorage.setItem('sipay_akun', JSON.stringify(clean));
  localStorage.setItem('sipay_admin', JSON.stringify({ user: clean.user }));
  await saveSettings();
}
function renderAkunPage() {
  const a = getAkunData();
  const el = id => document.getElementById(id);
  if (!el('akunAvatar')) return;
  el('akunAvatar').textContent      = (a.user || 'A')[0].toUpperCase();
  el('akunNamaDisplay').textContent = a.user  || 'Admin';
  setIconText(el('akunEmailDisplay'), a.email ? '✉️ ' + a.email : '✉️ Belum diisi');
  setIconText(el('akunHpDisplay'), a.hp    ? '📱 ' + a.hp    : '📱 Belum diisi');
}
function openEditAkun() {
  const a = getAkunData();
  document.getElementById('akun_user').value  = a.user  || '';
  document.getElementById('akun_email').value = a.email || '';
  document.getElementById('akun_hp').value    = a.hp    || '';
  document.getElementById('editAkunModal').classList.add('open');
}
async function saveEditAkun() {
  const user  = document.getElementById('akun_user').value.trim();
  const email = document.getElementById('akun_email').value.trim();
  const hp    = document.getElementById('akun_hp').value.trim();
  if (!user) { toast('⚠️ Username tidak boleh kosong'); return; }
  const a = getAkunData();
  await saveAkunData({ ...a, user, email, hp });
  document.getElementById('editAkunModal').classList.remove('open');
  renderAkunPage();
  document.getElementById('adminLabel').textContent = user;
  toast('✅ Profil akun berhasil disimpan!');
}

// Ganti password: admin sudah terautentikasi (punya sesi), jadi tak perlu OTP
// email lagi — langsung ke input password baru, lalu update via Supabase Auth.
//
// Alur OTP lama sudah DIBUANG. Selain tak terpakai (openGantiPassword langsung
// ke langkah 3), kodenya dibuat DAN dicocokkan di dalam browser
// (`input !== otpCode`) — pola yang bisa dilewati siapa pun lewat konsol, jadi
// tidak layak dihidupkan lagi. Ikut terbuang: pustaka EmailJS dari CDN beserta
// kunci publiknya.
function openGantiPassword() {
  if (!hasAdminSession()) { toast('⚠️ Sesi berakhir — login ulang dulu'); return; }
  document.getElementById('gp_newpass').value = '';
  document.getElementById('gp_newpass2').value = '';
  document.getElementById('gp_step3_error').style.display = 'none';
  document.getElementById('gantiPassModal').classList.add('open');
}
function closeGantiPass() {
  document.getElementById('gantiPassModal').classList.remove('open');
}
async function saveNewPassword() {
  const p1 = document.getElementById('gp_newpass').value;
  const p2 = document.getElementById('gp_newpass2').value;
  const errEl = document.getElementById('gp_step3_error');
  if (!p1) { setIconText(errEl, '⚠️ Password baru tidak boleh kosong'); errEl.style.display='block'; return; }
  if (p1.length < 6) { setIconText(errEl, '⚠️ Password minimal 6 karakter'); errEl.style.display='block'; return; }
  if (p1 !== p2) { setIconText(errEl, '❌ Konfirmasi password tidak cocok'); errEl.style.display='block'; return; }
  try {
    await sbUpdatePassword(p1);
  } catch (e) {
    setIconText(errEl, '❌ Gagal ubah password: ' + (e.message || 'coba lagi'));
    errEl.style.display = 'block';
    return;
  }
  closeGantiPass();
  toast('✅ Password berhasil diubah! Silakan login ulang.');
  setTimeout(doLogout, 1500);
}
document.addEventListener('DOMContentLoaded', () => {
  renderAkunPage();
  const em = document.getElementById('editAkunModal');
  if (em) em.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  const gm = document.getElementById('gantiPassModal');
  if (gm) gm.addEventListener('click', function(e) { if(e.target===this) closeGantiPass(); });
  const gasModal = document.getElementById('gasSetupModal');
  if (gasModal) gasModal.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });

  // Sync nama madrasah & logo ke halaman login
  const p = getProfil();
  const loginTitle = document.getElementById('loginTitle');
  if (loginTitle) loginTitle.textContent = p.nama || 'SiPay';
  const loginSub = document.getElementById('loginSub');
  if (loginSub) loginSub.textContent = 'Sistem Pembayaran Santri';
  const logo = getLogo();
  if (logo) {
    const loginLogo = document.getElementById('loginLogo');
    if (loginLogo) loginLogo.innerHTML = `<img class="avatar-img" src="${safeUrl(logo)}">`;
  }
});

// ══════════════════════════════════════════
;// ══ js/kuitansi.js ══
// ── SiPay · Kuitansi (Modal, Hapus, Cetak, Riwayat) ──
// RIWAYAT KUITANSI
// ══════════════════════════════════════════
let pendingKwtData = null;
let pendingKwtId   = null;

function tutupModalCetakKwt() {
  document.getElementById('modalCetakKwt').style.display = 'none';
  toast('✅ Pembayaran berhasil disimpan!');
}

async function konfirmasiCetakKwt() {
  document.getElementById('modalCetakKwt').style.display = 'none';
  if (!pendingKwtData) return;
  // Tandai sudah dicetak
  if (pendingKwtId) {
    sb('kuitansi?id=eq.' + pendingKwtId, 'PATCH',
      { dicetak: true, dicetak_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' }).catch(()=>{});
  }
  await cetakKuitansi(pendingKwtData);
  toast('✅ Pembayaran disimpan & kuitansi dicetak!');
}

async function cetakKuitansiById(nama, timeStr) {
  // Cetak ulang dari session table — cari di Supabase dulu
  try {
    const rows = await sb('kuitansi?select=*&nama=eq.' + encodeURIComponent(nama) + '&order=created_at.desc&limit=5');
    // Cari yang waktu cocok (dibuat hari ini sesi ini)
    const match = rows[0];
    if (match) {
      // Tandai dicetak
      sb('kuitansi?id=eq.' + match.id, 'PATCH',
        { dicetak: true, dicetak_at: new Date().toISOString() },
        { 'Prefer': 'return=minimal' }).catch(()=>{});
      await cetakKuitansi({ ...match, time: match.tgl_bayar || timeStr || match.created_at });
      return;
    }
  } catch {}
  // Fallback ke pendingKwtData
  if (pendingKwtData && pendingKwtData.nama === nama) {
    await cetakKuitansi(pendingKwtData);
  }
}

async function cetakKuitansiFromRiwayat(id) {
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const r = rows[0];
    // Tandai dicetak
    sb('kuitansi?id=eq.' + id, 'PATCH',
      { dicetak: true, dicetak_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' }).catch(()=>{});
    const timeStr = r.tgl_bayar || (r.created_at
      ? new Date(r.created_at).toLocaleDateString('id-ID') + ' ' + new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})
      : '—');
    await cetakKuitansi({ ...r, time: timeStr });
    // Refresh tabel
    loadRiwayatKuitansi();
  } catch(e) { toast('⚠️ Gagal: ' + e.message); }
}

let _pendingHapusKwtId = null;

function tutupModalHapusKwt() {
  document.getElementById('modalHapusKwt').style.display = 'none';
  _pendingHapusKwtId = null;
}

async function hapusKuitansi(id) {
  // Ambil data kuitansi untuk ditampilkan di modal
  try {
    const rows = await sb('kuitansi?select=no_kuitansi,nama,total,ta_label,created_at&id=eq.' + id);
    if (rows.length) {
      const r = rows[0];
      const fmt = n => Number(n||0).toLocaleString('id-ID');
      const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '—';
      document.getElementById('modalHapusKwtNama').textContent = r.nama || '—';
      document.getElementById('modalHapusKwtDetail').innerHTML =
        `${esc(r.no_kuitansi || '—')} &nbsp;·&nbsp; Rp ${fmt(r.total)} &nbsp;·&nbsp; TA ${esc(r.ta_label || '—')}<br>
         <span class="meta-999">${tgl}</span>`;
    } else {
      document.getElementById('modalHapusKwtNama').textContent = 'Data Kuitansi';
      document.getElementById('modalHapusKwtDetail').textContent = '—';
    }
  } catch {
    document.getElementById('modalHapusKwtNama').textContent = 'Data Kuitansi';
    document.getElementById('modalHapusKwtDetail').textContent = id;
  }
  _pendingHapusKwtId = id;
  document.getElementById('modalHapusKwt').style.display = 'flex';
}

async function konfirmasiHapusKwt() {
  const id = _pendingHapusKwtId;
  if (!id) return;

  const btn = document.getElementById('modalHapusKwtConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg class="ic"><use href="#i-clock"/></svg> Menghapus...';

  try {
    // 1. Ambil data kuitansi
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const kwt = rows[0];

    // 2. Balik efek pembayaran ke data siswa & tagihan
    // Perubahan dikumpulkan sebagai SELISIH lalu digabungkan ke kondisi terbaru
    // di server — supaya pembayaran yang diinput dari device lain sesudah
    // kuitansi ini dibuat tidak ikut terhapus.
    if (kwt.nama && kwt.items?.length) {
      const ops = { cur: [], hist: [] };
      const pushOp = (o) => { if (o) { if (o.cur) ops.cur.push(o.cur); if (o.hist) ops.hist.push(o.hist); } };

      for (const item of kwt.items) {
        const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
        const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';

        if (kwt.is_koreksi) {
          // Kuitansi koreksi: balik efek koreksi
          if (dibatalkan) {
            if (item.bulan) pushOp(sppRevertOp(item, +1));
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await addTagihanPaid(t.id, item.amount);
            }
          } else if (dikoreksi) {
            if (item.bulan && item.selisih) pushOp(sppDeltaOp(item, -item.selisih));
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await addTagihanPaid(t.id, -item.amount);
            }
          }
        } else {
          // Kuitansi biasa: kurangi pembayaran
          if (item.bulan) {
            pushOp(sppRevertOp(item, -1));
          } else if (item.item_id && item.item_id !== 'spp') {
            const t = findTagihan(kwt.nama, item.item_id);
            if (t) await addTagihanPaid(t.id, -item.amount);
          }
        }
      }

      if (ops.cur.length || ops.hist.length) {
        await commitSppOps(kwt.nama, ops);
      }

      // Hapus tanda "dikoreksi" dari kuitansi lama jika ini kuitansi koreksi
      if (kwt.is_koreksi && kwt.ref_no_kuitansi) {
        await sb('kuitansi?no_kuitansi=eq.' + encodeURIComponent(kwt.ref_no_kuitansi),
          'PATCH', { dikoreksi_oleh: null }, { 'Prefer': 'return=minimal' }).catch(() => {});
      }
    }

    // 3. Hapus kuitansi
    await sb('kuitansi?id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });

    tutupModalHapusKwt();
    toast('🗑️ Kuitansi dihapus & data pembayaran dikembalikan');
    loadRiwayatKuitansi();
    renderDashboard(); renderSiswaTable(); renderTunggakan();

  } catch(e) {
    toast('⚠️ Gagal: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg> Ya, Hapus';
  }
}

// ── Riwayat Kuitansi: pencarian di sisi server + paginasi ──
// Dulu hanya menarik 500 baris lalu menyaring di klien — tak cukup untuk
// arsip besar (mis. ribuan entri Buku Induk). Kini filter & pencarian
// dikirim ke server, dan hasilnya dipaginasi.
let kwtPage = 0;
const KWT_PAGE_SIZE = 100;
function kwtNextPage() { kwtPage++; loadRiwayatKuitansi(true); }
function kwtPrevPage() { if (kwtPage > 0) { kwtPage--; loadRiwayatKuitansi(true); } }

// Susun bagian filter PostgREST (dipakai untuk ambil data & hitung total).
function kwtBuildFilters() {
  const q      = document.getElementById('kwt_search')?.value?.trim() || '';
  const ta     = document.getElementById('kwt_ta')?.value || '';
  const dari   = document.getElementById('kwt_dari')?.value || '';
  const sampai = document.getElementById('kwt_sampai')?.value || '';
  const f = [];
  if (q) {
    const v = encodeURIComponent('*' + q + '*');   // ilike wildcard PostgREST
    f.push(`or=(nama.ilike.${v},no_kuitansi.ilike.${v},ta_label.ilike.${v})`);
  }
  if (ta)     f.push('ta_label=eq.' + encodeURIComponent(ta));
  if (dari)   f.push('created_at=gte.' + dari + 'T00:00:00');
  if (sampai) f.push('created_at=lte.' + sampai + 'T23:59:59');
  return f;
}
// Hitung total baris yang cocok (best-effort lewat header Content-Range).
async function kwtCountTotal(filters) {
  try {
    const qs = ['select=id'].concat(filters).join('&');
    const r = await fetch(SB_URL + '/rest/v1/kuitansi?' + qs, {
      headers: { ...authHeaders(), 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
    });
    const cr = r.headers.get('content-range') || '';
    return parseInt(cr.split('/')[1]);
  } catch { return NaN; }
}

async function loadRiwayatKuitansi(keepPage) {
  if (!keepPage) kwtPage = 0;
  const el = document.getElementById('kwtTableWrap');
  const statsEl = document.getElementById('kwtStats');
  if (!el) return;
  el.innerHTML = '<div class="text-center text-muted p-24">Memuat...</div>';

  const filters = kwtBuildFilters();

  try {
    const offset = kwtPage * KWT_PAGE_SIZE;
    const url = ['kuitansi?select=*', 'order=created_at.desc']
      .concat(filters)
      .concat(['limit=' + KWT_PAGE_SIZE, 'offset=' + offset]).join('&');
    let rows = await sb(url);
    const total = await kwtCountTotal(filters);              // bisa NaN bila gagal
    const known = Number.isFinite(total);
    const totalPages = known ? Math.max(1, Math.ceil(total / KWT_PAGE_SIZE))
                             : kwtPage + (rows.length === KWT_PAGE_SIZE ? 2 : 1);
    const hasNext = known ? (kwtPage + 1 < totalPages) : (rows.length === KWT_PAGE_SIZE);

    // Stats (Total dari server; nominal & cetak dihitung untuk halaman ini)
    const nominalHal = rows.reduce((s,r) => s + (r.total||0), 0);
    const sudahCetak = rows.filter(r => r.dicetak).length;
    if (statsEl) statsEl.innerHTML = `
      <div class="stat-card blue"><div class="stat-label">Total Kuitansi</div><div class="stat-value fs-22">${known ? total : '—'}</div><div class="stat-sub">${filters.length ? 'sesuai filter' : 'semua data'}</div><div class="stat-icon"><svg class="ic"><use href="#i-file"/></svg></div></div>
      <div class="stat-card green"><div class="stat-label">Nominal (halaman ini)</div><div class="stat-value fs-18">${rp(nominalHal)}</div><div class="stat-sub">${rows.length} baris ditampilkan</div><div class="stat-icon"><svg class="ic"><use href="#i-cash"/></svg></div></div>
      <div class="stat-card gold"><div class="stat-label">Halaman</div><div class="stat-value fs-22">${kwtPage + 1}<span class="fs-13 fw-500"> / ${totalPages}</span></div><div class="stat-sub">${KWT_PAGE_SIZE} per halaman</div><div class="stat-icon"><svg class="ic"><use href="#i-file"/></svg></div></div>
    `;

    if (!rows.length) {
      el.innerHTML = '<div class="text-center text-muted p-32 fs-13">Tidak ada data kuitansi.</div>';
      return;
    }

    const fmt = n => Number(n||0).toLocaleString('id-ID');
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table" id="kwtTable">
          <thead><tr>
            <th>No. Kuitansi</th>
            <th>Tanggal</th>
            <th>Nama Santri</th>
            <th>Kelas</th>
            <th>TA</th>
            <th>Rincian</th>
            <th class="text-right">Total</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              // Utamakan tanggal pembayaran yang dipilih admin (tgl_bayar), fallback created_at
              let tgl, jam;
              if (r.tgl_bayar) {
                const parts = String(r.tgl_bayar).split(' ');
                tgl = parts[0] || '—';
                jam = parts[1] || '';
              } else {
                tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
                jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '';
              }
              const items = Array.isArray(r.items) ? r.items.map(i => i.name + (i.bulan?' ('+( MONTH_FULL[i.bulan]||i.bulan)+')':'')).join(', ') : '—';
              const isInduk = typeof isIndukKwt === 'function' && isIndukKwt(r);
              const isIncomplete = typeof indukIncomplete === 'function' && indukIncomplete(r);
              const indukBadges = `${isInduk?'<br><span class="bg-primary-pale text-primary rounded-20 p-2-8 fs-12 fw-700"><svg class="ic"><use href="#i-book"/></svg> Buku Induk</span>':''}${isIncomplete?`<br><span class="pill-sm-warn" title="Data tidak lengkap"><svg class="ic"><use href="#i-alert"/></svg> Tidak lengkap</span>`:''}`;
              const statusBadge = r.dikoreksi_oleh
                ? `<span class="pill pill-koreksi"><svg class="ic"><use href="#i-refresh"/></svg> Dikoreksi</span><br><span class="meta-999">${esc(r.dikoreksi_oleh)}</span>`
                : r.is_koreksi
                ? `<span class="pill pill-warn"><svg class="ic"><use href="#i-clip"/></svg> Kuitansi Koreksi</span><br><span class="meta-999">Ref: ${esc(r.ref_no_kuitansi||'—')}</span>`
                : r.dicetak
                ? `<span class="pill pill-ok"><svg class="ic"><use href="#i-check"/></svg> Dicetak</span>`
                : `<span class="pill pill-belum"><svg class="ic"><use href="#i-clock"/></svg> Belum</span>`;
              return `<tr>
                <td class="fw-700 fs-12 text-primary">${esc(r.no_kuitansi||'—')}</td>
                <td class="fs-12">${tgl}<br><span class="hint">${jam}</span></td>
                <td><strong>${esc(r.nama)}</strong></td>
                <td>${esc(r.kelas||'—')}</td>
                <td><span class="tag-primary">${esc(r.ta_label||'—')}</span></td>
                <td class="cell-rincian">${esc(items)}</td>
                <td class="text-right fw-700 text-primary-light">Rp ${fmt(r.total)}</td>
                <td>${statusBadge}${indukBadges}</td>
                <td class="nowrap">
                  <button class="btn btn-outline btn-sm" onclick="openIndukDetail('${r.id}')" title="Lihat detail"><svg class="ic"><use href="#i-search"/></svg> Detail</button>
                  <button class="btn btn-primary btn-sm" onclick="cetakKuitansiFromRiwayat('${r.id}')" title="Cetak ulang"><svg class="ic"><use href="#i-print"/></svg> Cetak</button>
                  ${(!r.dikoreksi_oleh && !r.is_koreksi) ? `<button class="btn btn-outline btn-sm" onclick="openKoreksiKwt('${r.id}')" title="Edit / koreksi kuitansi"><svg class="ic"><use href="#i-edit"/></svg> Koreksi</button>` : ''}
                  ${!r.dikoreksi_oleh ? `<button class="btn btn-danger btn-sm act-del" onclick="hapusKuitansi('${r.id}')" title="Hapus kuitansi"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-center gap-12 mt-14 flex-wrap">
        <button class="btn btn-outline btn-sm" ${kwtPage <= 0 ? 'disabled' : ''} onclick="kwtPrevPage()">← Sebelumnya</button>
        <span class="fs-13 text-muted">Halaman <strong>${kwtPage + 1}</strong> dari ${totalPages}</span>
        <button class="btn btn-outline btn-sm" ${hasNext ? '' : 'disabled'} onclick="kwtNextPage()">Berikutnya →</button>
      </div>`;
  } catch(e) {
    el.innerHTML = `
      <div class="p-24 text-center">
        <div class="fs-32 mb-12"><svg class="ic"><use href="#i-alert"/></svg></div>
        <div class="fw-700 fs-15 text-danger mb-8">Gagal Memuat Riwayat Kuitansi</div>
        <div class="fs-13 text-muted mb-16">Terjadi kesalahan saat mengambil data dari server.</div>
        <div class="warn-banner">
          <strong>Detail error:</strong><br>${e.message || 'Koneksi ke Supabase gagal. Periksa koneksi internet Anda.'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="loadRiwayatKuitansi()"><svg class="ic"><use href="#i-refresh"/></svg> Coba Lagi</button>
      </div>`;
    if (statsEl) statsEl.innerHTML = '';
  }
}

function resetFilterKwt() {
  document.getElementById('kwt_search').value  = '';
  document.getElementById('kwt_dari').value    = '';
  document.getElementById('kwt_sampai').value  = '';
  const selTA = document.getElementById('kwt_ta');
  if (selTA) selTA.value = '';
  loadRiwayatKuitansi();
}

// ══════════════════════════════════════════
;// ══ js/buku-induk.js ══
// ── SiPay · Buku Induk (Input Data Pembayaran Lama) ──
// ══════════════════════════════════════════════════════════════
// Buku Induk = arsip seluruh pembayaran yang pernah masuk dari
// angkatan / tahun ajaran sebelumnya. Data disimpan ke tabel
// `kuitansi` yang sama (jadi otomatis muncul & bisa dicari di
// halaman Riwayat Kuitansi) TANPA menyentuh tagihan tahun berjalan.
//
// Penanda (tanpa perlu kolom DB baru):
//   • Entri Buku Induk  → no_kuitansi berawalan "BI-"
//   • Data tidak lengkap → catatan berawalan INDUK_TAG, diikuti alasan
//     dan (opsional) catatan asli pengguna.
// ══════════════════════════════════════════════════════════════

const BUKU_INDUK_PREFIX = 'BI-';
const INDUK_TAG         = '[DATA TIDAK LENGKAP]';
const INDUK_NOTE_SEP    = ' | Catatan: ';

let indukBuffer  = [];   // hasil parse file upload massal
let indukSession = [];   // entri yang disimpan pada sesi input manual ini

// ── Deteksi & parsing penanda ──
function isIndukKwt(r) {
  return String(r?.no_kuitansi || '').toUpperCase().startsWith(BUKU_INDUK_PREFIX);
}
function indukIncomplete(r) {
  return String(r?.catatan || '').startsWith(INDUK_TAG);
}
// Ambil deskripsi masalah (alasan tidak lengkap) dari catatan.
function indukMasalah(r) {
  const c = String(r?.catatan || '');
  if (!c.startsWith(INDUK_TAG)) return '';
  let body = c.slice(INDUK_TAG.length).trim();
  const sepIdx = body.indexOf(INDUK_NOTE_SEP);
  if (sepIdx >= 0) body = body.slice(0, sepIdx);
  return body.trim();
}
// Ambil catatan asli pengguna (tanpa tag/alasan).
function indukCatatanAsli(r) {
  const c = String(r?.catatan || '');
  if (!c.startsWith(INDUK_TAG)) return c;
  const sepIdx = c.indexOf(INDUK_NOTE_SEP);
  return sepIdx >= 0 ? c.slice(sepIdx + INDUK_NOTE_SEP.length).trim() : '';
}
// Rakit nilai kolom catatan dari alasan + catatan pengguna.
function buildIndukCatatan(reasons, userNote) {
  const note = (userNote || '').trim();
  if (reasons && reasons.length) {
    let out = `${INDUK_TAG} ${reasons.join('; ')}`;
    if (note) out += `${INDUK_NOTE_SEP}${note}`;
    return out;
  }
  return note;
}

// ── Util ──
function biParseNominal(v) {
  return Number(String(v == null ? '' : v).replace(/[^0-9]/g, '')) || 0;
}
// Cocokkan nama item ke definisi payItems (biar item_id konsisten).
function biResolveItem(name) {
  const n = String(name || '').trim();
  if (!n) return { item_id: 'lainnya', name: 'Pembayaran' };
  const hit = (appState.payItems || []).find(
    i => i.name.toLowerCase() === n.toLowerCase() || i.id.toLowerCase() === n.toLowerCase()
  );
  if (hit) return { item_id: hit.id, name: hit.name };
  return { item_id: 'lainnya', name: n };
}
function biNormalizeBulan(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const hit = MONTHS.find(m => m.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  // cocokkan nama panjang → singkatan
  const full = Object.entries(MONTH_FULL).find(([, f]) => f.toLowerCase() === s.toLowerCase());
  return full ? full[0] : null;
}

// Nomor Buku Induk berikutnya (fetch max sekali; dipakai berurutan).
async function indukBaseSeq() {
  try {
    const rows = await sb('kuitansi?select=no_kuitansi&no_kuitansi=ilike.' + BUKU_INDUK_PREFIX + '*&order=no_kuitansi.desc&limit=1');
    if (rows.length) return parseInt(String(rows[0].no_kuitansi).replace(/[^0-9]/g, '')) || 0;
  } catch (e) { console.error('indukBaseSeq:', e); }
  return 0;
}
function indukNo(seq) { return BUKU_INDUK_PREFIX + String(seq).padStart(5, '0'); }

// ── Render halaman ──
function renderBukuIndukPage() {
  biRenderSession();
  // datalist nama item
  const dl = document.getElementById('bi_item_names');
  if (dl) dl.innerHTML = (appState.payItems || []).map(i =>`<option value="${esc(i.name)}">`).join('');
}

// ── Modal: Input Manual ──
function openBiManual() {
  biResetManualForm();
  document.getElementById('biManualModal').classList.add('open');
  setTimeout(() => document.getElementById('bi_nama')?.focus(), 60);
}
function closeBiManual() {
  document.getElementById('biManualModal').classList.remove('open');
}

// ── Modal: Upload Massal ──
function openBiMassal() {
  indukBuffer = [];
  const prev = document.getElementById('bi_preview_wrap'); if (prev) prev.innerHTML = '';
  const btn  = document.getElementById('bi_confirm_btn');  if (btn) btn.style.display = 'none';
  const file = document.getElementById('bi_massal_file');  if (file) file.value = '';
  document.getElementById('biMassalModal').classList.add('open');
}
function closeBiMassal() {
  document.getElementById('biMassalModal').classList.remove('open');
}

// ══════════════════════════════════════════
// INPUT MANUAL
// ══════════════════════════════════════════
function biItemRowHTML() {
  const bulanOpts = ['<option value="">— Bulan (opsional) —</option>']
    .concat(MONTHS.map(m =>`<option value="${m}">${esc(MONTH_FULL[m] || m)}</option>`)).join('');
  return `<div class="bi-item-row bi-item-grid">
    <input type="text" class="bi-item-name p-9-11 border-1-5-border rounded-9 fs-13 font-inherit outline-none box-border" list="bi_item_names" placeholder="Nama item (mis. SPP)"
     >
    <input type="text" class="bi-item-nominal p-9-11 border-1-5-border rounded-9 fs-13 font-inherit outline-none box-border" inputmode="numeric" placeholder="Nominal (Rp)" oninput="biRecalcTotal()"
     >
    <select class="bi-item-bulan p-9-11 border-1-5-border rounded-9 fs-13 font-inherit outline-none">${bulanOpts}</select>
    <button type="button" class="btn btn-danger btn-sm" title="Hapus baris"
      onclick="this.closest('.bi-item-row').remove();biRecalcTotal()">✕</button>
  </div>`;
}
function biAddItemRow() {
  const wrap = document.getElementById('bi_items_wrap');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', biItemRowHTML());
}
function biRecalcTotal() {
  let total = 0;
  document.querySelectorAll('#bi_items_wrap .bi-item-nominal').forEach(el => { total += biParseNominal(el.value); });
  const t = document.getElementById('bi_total');
  if (t) t.textContent = rp(total);
}
function biResetManualForm() {
  ['bi_nama', 'bi_kelas', 'bi_nisn', 'bi_catatan'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const wrap = document.getElementById('bi_items_wrap');
  if (wrap) wrap.innerHTML = biItemRowHTML();
  biRecalcTotal();
}

// Kumpulkan item dari form manual.
function biCollectItems() {
  const items = [];
  document.querySelectorAll('#bi_items_wrap .bi-item-row').forEach(row => {
    const name    = row.querySelector('.bi-item-name').value.trim();
    const nominal = biParseNominal(row.querySelector('.bi-item-nominal').value);
    const bulan   = row.querySelector('.bi-item-bulan').value || null;
    if (!name && !nominal) return; // baris kosong → lewati
    items.push({ name, nominal, bulan });
  });
  return items;
}

// Hitung alasan ketidaklengkapan sebuah entri.
function biComputeReasons({ ta, kelas, items }) {
  const reasons = [];
  if (!ta)    reasons.push('tahun ajaran kosong');
  if (!kelas) reasons.push('kelas kosong');
  const withAmount = items.filter(it => it.nominal > 0);
  if (!withAmount.length) reasons.push('nominal pembayaran tidak tercatat');
  items.forEach(it => {
    if (it.name && !it.nominal) reasons.push(`nominal "${it.name}" kosong`);
    if (!it.name && it.nominal) reasons.push('nama item kosong');
  });
  return reasons;
}

async function biSubmitManual() {
  const btn = document.getElementById('bi_submit_btn');
  const ta      = document.getElementById('bi_ta').value.trim();
  const nama    = document.getElementById('bi_nama').value.trim();
  const kelas   = document.getElementById('bi_kelas').value.trim();
  const nisn    = document.getElementById('bi_nisn').value.trim();
  const tanggal = document.getElementById('bi_tanggal').value; // yyyy-mm-dd atau ''
  const catatan = document.getElementById('bi_catatan').value.trim();

  if (!nama) { toast('⚠️ Nama santri wajib diisi'); document.getElementById('bi_nama').focus(); return; }

  const rawItems = biCollectItems();
  if (!rawItems.length) { toast('⚠️ Isi minimal satu item pembayaran'); return; }

  const reasons = biComputeReasons({ ta, kelas, items: rawItems });
  const total = rawItems.reduce((s, it) => s + it.nominal, 0);
  const items = rawItems.map(it => {
    const r = biResolveItem(it.name);
    return { item_id: r.item_id, name: r.name, amount: it.nominal, bulan: biNormalizeBulan(it.bulan) };
  });

  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic"><use href="#i-clock"/></svg> Menyimpan...'; }
  try {
    const seq = (await indukBaseSeq()) + 1;
    const row = {
      no_kuitansi: indukNo(seq),
      nama, kelas: kelas || '', nisn: nisn || '',
      items, total,
      catatan: buildIndukCatatan(reasons, catatan),
      dicetak: false,
      ta_label: ta || '',
    };
    if (tanggal) row.created_at = new Date(tanggal + 'T00:00:00').toISOString();
    const res = await sb('kuitansi', 'POST', row, { 'Prefer': 'return=representation' });
    const saved = res?.[0] || row;

    indukSession.unshift({
      no_kuitansi: saved.no_kuitansi, nama, kelas, ta_label: ta,
      total, incomplete: reasons.length > 0, masalah: reasons.join('; '),
    });
    biRenderSession();
    // Segarkan daftar Buku Induk (halaman riwayat) bila terbuka
    if (typeof loadRiwayatKuitansi === 'function') loadRiwayatKuitansi();

    // Reset untuk entri berikutnya (pertahankan TA & tanggal biar cepat)
    biResetManualForm();
    document.getElementById('bi_nama').focus();
    toast(reasons.length
      ? '✅ Tersimpan ke Buku Induk (ditandai: data tidak lengkap)'
      : '✅ Tersimpan ke Buku Induk');
  } catch (e) {
    console.error('biSubmitManual:', e);
    toast('⚠️ Gagal menyimpan: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#i-save"/></svg> Simpan ke Buku Induk'; }
  }
}

function biRenderSession() {
  const wrap = document.getElementById('bi_session_wrap');
  if (!wrap) return;
  if (!indukSession.length) {
    wrap.innerHTML = '<div class="text-center text-muted p-18 fs-13">Belum ada entri pada sesi ini.</div>';
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>No. Induk</th><th>Nama</th><th>Kelas</th><th>TA</th><th class="text-right">Total</th><th>Status</th></tr></thead>
    <tbody>${indukSession.map(s => `<tr>
      <td class="fw-700 fs-12 text-primary">${esc(s.no_kuitansi)}</td>
      <td><strong>${esc(s.nama)}</strong></td>
      <td>${esc(s.kelas || '—')}</td>
      <td>${esc(s.ta_label || '—')}</td>
      <td class="text-right fw-700">${rp(s.total)}</td>
      <td>${s.incomplete
        ? `<span class="pill pill-warn" title="${esc(s.masalah)}"><svg class="ic"><use href="#i-alert"/></svg> Tidak lengkap</span>`
        : '<span class="pill pill-ok"><svg class="ic"><use href="#i-check"/></svg> Lengkap</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ══════════════════════════════════════════
// UPLOAD MASSAL
// ══════════════════════════════════════════
const INDUK_COLS = {
  TA:      ['TAHUN_AJARAN', 'TA', 'TAHUN AJARAN', 'YEAR'],
  NAMA:    ['NAMA', 'NAME', 'NAMA LENGKAP', 'NAMA_LENGKAP'],
  KELAS:   ['KELAS', 'CLASS', 'GRADE', 'TINGKAT'],
  NISN:    ['NISN'],
  ITEM:    ['ITEM', 'JENIS', 'JENIS_BAYAR', 'JENIS BAYAR', 'ITEM_BAYAR', 'KETERANGAN'],
  NOMINAL: ['NOMINAL', 'JUMLAH', 'AMOUNT', 'BAYAR'],
  BULAN:   ['BULAN', 'MONTH'],
  TANGGAL: ['TANGGAL', 'DATE', 'TGL'],
  CATATAN: ['CATATAN', 'NOTE', 'KETERANGAN_TAMBAHAN'],
};
function indukFindCol(obj, keys) {
  for (const k of keys) {
    const variants = [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g, ' '), k.replace(/ /g, '_')];
    for (const v of variants) {
      if (obj[v] !== undefined && String(obj[v]).trim() !== '') return obj[v];
    }
  }
  return '';
}

function handleIndukFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => indukParseCSV(e.target.result);
    reader.readAsText(file);
  } else {
    // Pustaka Excel ditarik saat dibutuhkan saja (lihat xlsxReady di config.js).
    xlsxReady(() => {
      if (typeof XLSX === 'undefined') {
        toast('⚠️ Library Excel gagal dimuat. Cek koneksi atau gunakan format CSV.');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          indukParseRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
        } catch (err) { toast('⚠️ Gagal membaca file: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
}
function indukParseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return;
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, idx) => obj[h] = cells[idx] || '');
    rows.push(obj);
  }
  indukParseRows(rows);
}

function indukParseRows(rows) {
  indukBuffer = [];
  rows.forEach(row => {
    const nama = String(indukFindCol(row, INDUK_COLS.NAMA) || '').trim();
    const item = String(indukFindCol(row, INDUK_COLS.ITEM) || '').trim();
    const nominal = biParseNominal(indukFindCol(row, INDUK_COLS.NOMINAL));
    // Baris benar-benar kosong → lewati
    if (!nama && !item && !nominal) return;
    const ta      = String(indukFindCol(row, INDUK_COLS.TA) || '').trim();
    const kelas   = String(indukFindCol(row, INDUK_COLS.KELAS) || '').trim();
    const nisn    = String(indukFindCol(row, INDUK_COLS.NISN) || '').trim().replace(/'/g, '');
    const bulan   = biNormalizeBulan(indukFindCol(row, INDUK_COLS.BULAN));
    const tanggal = String(indukFindCol(row, INDUK_COLS.TANGGAL) || '').trim();
    const catatan = String(indukFindCol(row, INDUK_COLS.CATATAN) || '').trim();

    const rawItems = [{ name: item, nominal, bulan }];
    const reasons = biComputeReasons({ ta, kelas, items: rawItems });
    if (!nama) reasons.unshift('nama santri kosong');

    indukBuffer.push({ ta, nama, kelas, nisn, item, nominal, bulan, tanggal, catatan, reasons });
  });

  if (!indukBuffer.length) { toast('⚠️ Tidak ada data yang bisa dibaca dari file'); return; }
  indukRenderPreview();
}

function indukRenderPreview() {
  const wrap = document.getElementById('bi_preview_wrap');
  const btn  = document.getElementById('bi_confirm_btn');
  if (!wrap) return;
  const tidakLengkap = indukBuffer.filter(r => r.reasons.length).length;
  wrap.innerHTML = `
    <div class="flex gap-10 flex-wrap mb-12">
      <span class="bg-primary-pale text-primary rounded-8 p-6-12 fs-12 fw-700">${indukBuffer.length} baris terbaca</span>
      ${tidakLengkap ? `<span class="tag-lg-warn"><svg class="ic"><use href="#i-alert"/></svg> ${tidakLengkap} baris tidak lengkap</span>` : '<span class="tag-lg-ok"><svg class="ic"><use href="#i-check"/></svg> Semua lengkap</span>'}
    </div>
    <div class="table-wrap scroll-340"><table class="data-table">
      <thead><tr><th>#</th><th>TA</th><th>Nama</th><th>Kelas</th><th>Item</th><th class="text-right">Nominal</th><th>Bulan</th><th>Status</th></tr></thead>
      <tbody>${indukBuffer.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.ta || '—')}</td>
        <td><strong>${esc(r.nama || '—')}</strong></td>
        <td>${esc(r.kelas || '—')}</td>
        <td>${esc(r.item || '—')}</td>
        <td class="text-right">${r.nominal ? rp(r.nominal) : '—'}</td>
        <td>${esc(r.bulan ? (MONTH_FULL[r.bulan] || r.bulan) : '—')}</td>
        <td>${r.reasons.length
          ? `<span class="pill pill-warn" title="${esc(r.reasons.join('; '))}"><svg class="ic"><use href="#i-alert"/></svg> ${esc(r.reasons.join('; '))}</span>`
          : '<span class="pill pill-ok"><svg class="ic"><use href="#i-check"/></svg> Lengkap</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  if (btn) { btn.style.display = 'inline-flex'; btn.disabled = false; btn.innerHTML = `<svg class="ic"><use href="#i-save"/></svg> Simpan ${indukBuffer.length} Entri ke Buku Induk`; }
}

async function confirmImportInduk() {
  if (!indukBuffer.length) { toast('⚠️ Tidak ada data untuk disimpan'); return; }
  const btn = document.getElementById('bi_confirm_btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="ic"><use href="#i-clock"/></svg> Menyimpan...'; }
  try {
    let seq = await indukBaseSeq();
    const payload = indukBuffer.map(r => {
      seq += 1;
      const resolved = biResolveItem(r.item);
      const items = [{ item_id: resolved.item_id, name: resolved.name, amount: r.nominal, bulan: r.bulan || null }];
      const row = {
        no_kuitansi: indukNo(seq),
        nama: r.nama || '(Tanpa Nama)',
        kelas: r.kelas || '',
        nisn: r.nisn || '',
        items, total: r.nominal || 0,
        catatan: buildIndukCatatan(r.reasons, r.catatan),
        dicetak: false,
        ta_label: r.ta || '',
      };
      const iso = indukTanggalToISO(r.tanggal);
      if (iso) row.created_at = iso;
      return row;
    });
    // Insert massal dalam satu permintaan
    await sb('kuitansi', 'POST', payload, { 'Prefer': 'return=minimal' });
    const n = payload.length;
    indukBuffer = [];
    document.getElementById('bi_preview_wrap').innerHTML =
      `<div class="text-center p-24 text-primary fw-700"><svg class="ic"><use href="#i-check"/></svg> ${n} entri berhasil disimpan ke Buku Induk.</div>`;
    if (btn) btn.style.display = 'none';
    const fileEl = document.getElementById('bi_massal_file');
    if (fileEl) fileEl.value = '';
    toast(`✅ ${n} entri tersimpan ke Buku Induk`);
    if (typeof loadRiwayatKuitansi === 'function') loadRiwayatKuitansi();
  } catch (e) {
    console.error('confirmImportInduk:', e);
    toast('⚠️ Gagal menyimpan: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg class="ic"><use href="#i-save"/></svg> Simpan ${indukBuffer.length} Entri ke Buku Induk`; }
  }
}

// Terima format tanggal umum: yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy.
function indukTanggalToISO(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))      return new Date(+m[1], +m[2] - 1, +m[3]).toISOString();
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) return new Date(+m[3], +m[2] - 1, +m[1]).toISOString();
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

function downloadTemplateInduk() { xlsxReady(_downloadTemplateInduk); }
function _downloadTemplateInduk() {
  const headers = ['TAHUN_AJARAN', 'NAMA', 'KELAS', 'NISN', 'ITEM', 'NOMINAL', 'BULAN', 'TANGGAL', 'CATATAN'];
  const contoh = [
    ['2023/2024', 'AHMAD FAUZI',      '7', '1234567890', 'SPP Bulanan',  450000, 'Jul', '2023-07-10', ''],
    ['2023/2024', 'AHMAD FAUZI',      '7', '1234567890', 'Uang Pangkal', 1500000, '',   '2023-07-10', 'Lunas'],
    ['2024/2025', 'NAMA SANTRI DUA',  '8', '',           'SPP Bulanan',  500000, 'Agt', '',          ''],
    ['2024/2025', 'NAMA SANTRI TIGA', '',  '',           'SPP Bulanan',  0,      '',    '',          'nominal belum diketahui'],
  ];
  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...contoh]);
    ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Induk');
    XLSX.writeFile(wb, 'template_buku_induk.xlsx');
    toast('📋 Template Excel Buku Induk diunduh');
  } else {
    const csv = [headers.join(',')].concat(contoh.map(r => r.join(','))).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'template_buku_induk.csv';
    a.click();
    toast('📋 Template CSV Buku Induk diunduh');
  }
}

// ══════════════════════════════════════════
// DETAIL (dipakai juga dari Riwayat Kuitansi)
// ══════════════════════════════════════════
async function openIndukDetail(id) {
  const modal = document.getElementById('indukDetailModal');
  const body  = document.getElementById('bi_detail_body');
  if (!modal || !body) return;
  body.innerHTML = '<div class="text-center text-muted p-24">Memuat...</div>';
  modal.classList.add('open');
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { body.innerHTML = '<div class="text-danger p-16">Data tidak ditemukan.</div>'; return; }
    body.innerHTML = renderIndukDetail(rows[0]);
  } catch (e) {
    body.innerHTML = `<div class="text-danger p-16">Gagal memuat: ${esc(e.message || e)}</div>`;
  }
}
function closeIndukDetail() {
  document.getElementById('indukDetailModal')?.classList.remove('open');
}
function renderIndukDetail(r) {
  const tgl = r.tgl_bayar || (r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
  const metodeLabel = r.metode === 'transfer' ? '<svg class="ic"><use href="#i-bank"/></svg> Transfer' : (r.metode === 'tunai' ? '<svg class="ic"><use href="#i-cash"/></svg> Tunai' : '');
  const incomplete = indukIncomplete(r);
  const masalah = indukMasalah(r);
  const catatan = indukCatatanAsli(r);
  const induk = isIndukKwt(r);
  const items = Array.isArray(r.items) ? r.items : [];

  const warning = incomplete ? `
    <div class="alert-danger-sm">
      <div class="fw-800 fs-13 text-danger mb-3"><svg class="ic"><use href="#i-alert"/></svg> Data tidak lengkap</div>
      <div class="fs-12-5 text-text">${esc(masalah || 'Sebagian data pembayaran ini tidak tercatat lengkap dari arsip lama.')}</div>
    </div>` : '';

  const badges = `
    ${induk ? '<span class="tag-primary"><svg class="ic"><use href="#i-book"/></svg> Buku Induk</span>' : ''}
    ${incomplete ? '<span class="tag-warn"><svg class="ic"><use href="#i-alert"/></svg> Tidak lengkap</span>' : ''}`;

  const rowsHtml = items.length ? items.map(it => `<tr>
      <td>${esc(it.name || '—')}${it.bulan ? ` <span class="hint">(${esc(MONTH_FULL[it.bulan] || it.bulan)})</span>` : ''}</td>
      <td class="text-right">${it.amount ? rp(it.amount) : '<span class="text-danger">— tidak tercatat</span>'}</td>
    </tr>`).join('') : '<tr><td class="text-muted" colspan="2">Tidak ada rincian.</td></tr>';

  return `
    <div class="flex gap-8 flex-wrap mb-12">${badges}</div>
    ${warning}
    <div class="grid cols-2 gap-10 mb-14">
      <div><div class="hint">Nama</div><div class="fw-700">${esc(r.nama || '—')}</div></div>
      <div><div class="hint">Kelas</div><div class="fw-700">${esc(r.kelas || '—')}</div></div>
      <div><div class="hint">Tahun Ajaran</div><div class="fw-700">${esc(r.ta_label || '—')}</div></div>
      <div><div class="hint">Tanggal</div><div class="fw-700">${tgl}</div></div>
      <div><div class="hint">No.</div><div class="fw-700">${esc(r.no_kuitansi || '—')}</div></div>
      <div><div class="hint">NISN</div><div class="fw-700">${esc(r.nisn || '—')}</div></div>
      ${metodeLabel ? `<div><div class="hint">Metode</div><div class="fw-700">${metodeLabel}</div></div>` : ''}
      ${r.dibayar_oleh ? `<div><div class="hint">Dibayar oleh</div><div class="fw-700">${esc(r.dibayar_oleh)}</div></div>` : ''}
    </div>
    <div class="sub-title mb-6"><svg class="ic"><use href="#i-clip"/></svg> Rincian Pembayaran</div>
    <div class="table-wrap mb-12"><table class="data-table">
      <thead><tr><th>Item</th><th class="text-right">Nominal</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td class="fw-800">Total</td><td class="text-right fw-800 text-primary-light">${rp(r.total)}</td></tr></tfoot>
    </table></div>
    ${catatan ? `<div class="bg-bg rounded-10 p-10-12 fs-12-5"><strong>Catatan:</strong> ${esc(catatan)}</div>` : ''}`;
}
;// ══ js/koreksi.js ══
// ── SiPay · Koreksi Pembayaran ──
// AI CATATAN — Analisa bukti transfer → isi catatan
// ══════════════════════════════════════════

// ── Buka koreksi untuk satu kuitansi (dipicu dari menu Riwayat Kuitansi) ──
function openKoreksiKwt(id) {
  koreksiSelectedKwt = null;
  const cat = document.getElementById('koreksiCatatan');
  if (cat) cat.value = '';
  const ld = document.getElementById('koreksiLoading');
  if (ld) ld.style.display = 'none';
  const list = document.getElementById('koreksiItemList');
  if (list) list.innerHTML = '<div class="text-center text-muted p-16">Memuat...</div>';
  const ref = document.getElementById('koreksiRefLabel');
  if (ref) ref.textContent = '—';
  document.getElementById('koreksiModal').classList.add('open');
  selectKoreksiKwt(id);
}
function closeKoreksiModal() {
  document.getElementById('koreksiModal').classList.remove('open');
}
// Kompat: tak ada lagi langkah inline (kini modal). Cukup pastikan loading tertutup.
function showKoreksiInlineStep() {
  const ld = document.getElementById('koreksiLoading');
  if (ld) ld.style.display = 'none';
}

// ══════════════════════════════════════════
// KOREKSI PEMBAYARAN
// ══════════════════════════════════════════
let koreksiSelectedKwt = null; // kuitansi yang dipilih untuk dikoreksi
let koreksiNamaSuggIdx = -1;

// ── Step 1: Autocomplete nama ──
function onKoreksiNamaSearch() {
  koreksiNamaSuggIdx = -1;
  const q = (document.getElementById('koreksiNamaSearch').value || '').toLowerCase().trim();
  const dd = document.getElementById('koreksiNamaDropdown');
  const list = q ? appState.students.filter(s => s.nama.toLowerCase().includes(q) || (s.nisn && s.nisn.includes(q))) : appState.students.slice(0, 20);
  if (!list.length) { dd.innerHTML = `<div class="p-12-16 fs-13 text-muted">Tidak ditemukan</div>`; dd.style.display='block'; return; }
  dd.innerHTML = list.slice(0,12).map((s,i) => `
    <div class="koreksi-nama-item p-10-16 pointer border-b-1-border fs-13" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectKoreksiNama('${escJs(s.nama)}')"
      onmouseenter="this.style.background='var(--primary-pale)'" onmouseleave="this.style.background=''"
     >
      <div class="fw-600">${esc(s.nama)}</div>
      <div class="hint">${esc(s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas)}${s.nisn?' · NISN '+esc(s.nisn):''}</div>
    </div>`).join('');
  dd.style.display = 'block';
}

function onKoreksiNamaKeydown(e) {
  const items = document.querySelectorAll('.koreksi-nama-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); koreksiNamaSuggIdx = Math.min(koreksiNamaSuggIdx+1, items.length-1); items.forEach((el,i) => el.style.background = i===koreksiNamaSuggIdx?'var(--primary-pale)':''); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); koreksiNamaSuggIdx = Math.max(koreksiNamaSuggIdx-1, 0); items.forEach((el,i) => el.style.background = i===koreksiNamaSuggIdx?'var(--primary-pale)':''); }
  else if (e.key === 'Enter' && koreksiNamaSuggIdx >= 0) selectKoreksiNama(items[koreksiNamaSuggIdx].dataset.nama);
  else if (e.key === 'Escape') hideKoreksiDropdown();
}

function hideKoreksiDropdown() {
  const dd = document.getElementById('koreksiNamaDropdown');
  if (dd) dd.style.display = 'none';
}

async function selectKoreksiNama(nama) {
  document.getElementById('koreksiNama').value = nama;
  document.getElementById('koreksiNamaSearch').value = nama;
  hideKoreksiDropdown();
  await loadKoreksiKwtList(nama);
}

// ── Step 2: Daftar kuitansi ──
async function loadKoreksiKwtList(nama) {
  const listEl = document.getElementById('koreksiKwtList');
  listEl.innerHTML = '<div class="text-center text-muted p-16">Memuat...</div>';
  showKoreksiInlineStep(2);
  try {
    const rows = await sb('kuitansi?select=*&nama=eq.' + encodeURIComponent(nama) + '&is_koreksi=eq.false&order=created_at.desc&limit=20');
    if (!rows.length) { listEl.innerHTML = '<div class="text-center text-muted p-16 fs-13">Tidak ada kuitansi ditemukan.</div>'; return; }
    const fmt = n => Number(n||0).toLocaleString('id-ID');
    listEl.innerHTML = rows.map(r => {
      const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
      const sudahDikoreksi = !!r.dikoreksi_oleh;
      return `<div class="kwt-pick${sudahDikoreksi ? ' is-done' : ''}" onclick="${sudahDikoreksi ? '' : `selectKoreksiKwt('${r.id}')`}">
        <div class="flex justify-between items-center">
          <div>
            <div class="fw-700 fs-13 text-primary">${esc(r.no_kuitansi||'—')}</div>
            <div class="hint mt-2">${tgl} · TA ${esc(r.ta_label||'—')}</div>
          </div>
          <div class="text-right">
            <div class="fw-700 fs-14">Rp ${fmt(r.total)}</div>
            ${sudahDikoreksi
              ? `<div class="chip-gray">Sudah dikoreksi</div>`
              : `<div class="fs-12 text-primary-light">Klik untuk pilih →</div>`}
          </div>
        </div>
        ${r.catatan ? `<div class="meta-666"><svg class="ic"><use href="#i-msg"/></svg> ${esc(r.catatan)}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div class="text-danger p-16 fs-13">Gagal: ${e.message}</div>`;
  }
}

// ── Step 3: Pilih item koreksi ──
async function selectKoreksiKwt(id) {
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) return;
    koreksiSelectedKwt = rows[0];
    const kwt = koreksiSelectedKwt;
    const fmt = n => Number(n||0).toLocaleString('id-ID');

    document.getElementById('koreksiRefLabel').innerHTML =
      `Kuitansi: <strong>${esc(kwt.no_kuitansi)}</strong> · Rp ${fmt(kwt.total)} · TA ${esc(kwt.ta_label||'—')}`;

    // Render item-item kuitansi sebagai checklist koreksi
    const items = Array.isArray(kwt.items) ? kwt.items : [];
    const student = getStudent(kwt.nama);

    document.getElementById('koreksiItemList').innerHTML = items.map((item, i) => {
      const isPangkal = item.name?.toLowerCase().includes('pangkal');
      const pangkalPaidSekarang = student ? pangkalTunggakan(student) === 0 
        ? (student.pangkal||0) 
        : (student.pangkal_paid||0) : 0;
      return `<div class="koreksi-card">
        <label class="flex items-start gap-10 pointer">
          <input class="mt-3 w-16 h-16 accent-primary pointer" type="checkbox" id="koreksiChk_${i}" data-idx="${i}" onchange="toggleKoreksiItem(${i})">
          <div class="flex-1">
            <div class="fw-600 fs-13">${esc(item.name)}${item.bulan?' ('+esc(MONTH_FULL[item.bulan]||item.bulan)+')':''}</div>
            <div class="hint">Nilai tercatat di kuitansi: <strong>Rp ${fmt(item.amount)}</strong></div>
            ${isPangkal ? `<div class="meta-888">Total pangkal dibayar saat ini: Rp ${fmt(pangkalPaidSekarang)} dari Rp ${fmt(student?.pangkal||0)}</div>` : ''}
          </div>
        </label>
        <!-- Input nilai koreksi (muncul saat dicentang) -->
        <div class="koreksi-input" id="koreksiInput_${i}" hidden>
          <div class="fs-12 fw-600 mb-6 text-muted">Pilih Tindakan</div>
          <select class="w-full p-8-12 border-2-primary-light rounded-8 fs-13 font-inherit outline-none mb-8" id="koreksiAksi_${i}">
            <option value="batalkan">Batalkan item ini (pembayaran dianggap tidak terjadi)</option>
            <option value="koreksi_nilai">Koreksi nilai — ubah nominal yang benar</option>
          </select>
          <input class="w-full p-8-12 border-2-primary-light rounded-8 fs-13 font-inherit outline-none box-border" type="number" id="koreksiVal_${i}" placeholder="Nilai yang benar (Rp)..." value="${item.amount}"
            hidden
            oninput="updateKoreksiTotal()">
          ${isPangkal ? `<div class="koreksi-info" id="koreksiPangkalInfo_${i}" hidden></div>` : ''}
        </div>
      </div>`;
    }).join('');

    // Listener untuk select aksi — berlaku untuk semua item termasuk pangkal
    items.forEach((item, i) => {
      const aksiEl = document.getElementById('koreksiAksi_' + i);
      if (aksiEl) {
        aksiEl.addEventListener('change', () => {
          const valEl  = document.getElementById('koreksiVal_' + i);
          const infoEl = document.getElementById('koreksiPangkalInfo_' + i);
          const isPangkal = item.name?.toLowerCase().includes('pangkal');
          if (valEl) valEl.style.display = aksiEl.value === 'koreksi_nilai' ? 'block' : 'none';
          if (isPangkal && infoEl) {
            if (aksiEl.value === 'batalkan') {
              infoEl.style.display = 'block';
              infoEl.innerHTML = '<svg class="ic"><use href="#i-alert"/></svg> Pembayaran pangkal sebesar <strong>Rp ' + fmt(item.amount) + '</strong> akan dikurangi dari total yang tercatat.';
            } else if (aksiEl.value === 'koreksi_nilai') {
              infoEl.style.display = 'block';
              infoEl.innerHTML = '<svg class="ic"><use href="#i-edit"/></svg> Isikan nominal pangkal yang <strong>benar</strong> untuk kuitansi ini. Selisih akan disesuaikan otomatis.';
            } else {
              infoEl.style.display = 'none';
            }
          }
          updateKoreksiTotal();
        });
      }
    });

    showKoreksiInlineStep(3);
  } catch(e) { toast('⚠️ Gagal: ' + e.message); }
}

function toggleKoreksiItem(i) {
  const chk = document.getElementById('koreksiChk_' + i);
  const inp = document.getElementById('koreksiInput_' + i);
  if (inp) inp.style.display = chk?.checked ? 'block' : 'none';
  updateKoreksiTotal();
}

function updateKoreksiTotal() {
  // Placeholder — bisa dipakai untuk menampilkan ringkasan
}

// ── Proses koreksi ──
async function prosesKoreksi() {
  const kwt = koreksiSelectedKwt;
  if (!kwt) return;

  const items = Array.isArray(kwt.items) ? kwt.items : [];
  const catatan = document.getElementById('koreksiCatatan').value.trim();

  // Kumpulkan item yang dikoreksi
  const koreksiItems = [];
  items.forEach((item, i) => {
    const chk = document.getElementById('koreksiChk_' + i);
    if (!chk?.checked) return;
    const isPangkal = item.name?.toLowerCase().includes('pangkal');
    const aksiEl = document.getElementById('koreksiAksi_' + i);
    const valEl  = document.getElementById('koreksiVal_' + i);
    const aksi   = aksiEl?.value || 'batalkan';
    const nilaBaru = Number(valEl?.value) || 0;
    koreksiItems.push({ item, idx: i, aksi, nilaBaru, isPangkal });
  });

  if (!koreksiItems.length) { toast('⚠️ Pilih minimal 1 item untuk dikoreksi!'); return; }

  document.getElementById('koreksiLoading').style.display = 'block';
  [1,2,3].forEach(i => { const el = document.getElementById('koreksiStep'+i); if(el) el.style.display='none'; });

  try {
    const student = getStudent(kwt.nama);
    const si = appState.students.findIndex(s => s.nama === kwt.nama);
    const fmt = n => Number(n||0).toLocaleString('id-ID');

    // === 1. Rollback & terapkan koreksi ke data siswa & tagihan ===
    // Perubahan dicatat sebagai SELISIH, lalu digabungkan ke kondisi terbaru di
    // server — koreksi dari device ini tidak boleh menghapus pembayaran yang
    // sudah diinput dari device lain.
    const sppMonthsLokal = new Set(appState.students[si]?.spp_paid_months || []);
    const sppOps = { cur: [], hist: [] };
    const keteranganKoreksi = [];
    const tagihanUpdates = [];   // { id, delta }

    koreksiItems.forEach(({ item, idx, aksi, nilaBaru }) => {
      if (aksi === 'batalkan') {
        // Angsuran & tunggakan TA lama dibatalkan sebesar nominalnya; bulan
        // lunas biasa tahun berjalan dibatalkan utuh (perilaku lama).
        const op = item.bulan ? sppRevertOp(item, -1) : null;
        if (op && (op.hist || op.cur.delta !== undefined || sppMonthsLokal.has(item.bulan))) {
          if (op.cur)  sppOps.cur.push(op.cur);
          if (op.hist) sppOps.hist.push(op.hist);
          keteranganKoreksi.push(`SPP ${MONTH_FULL[item.bulan]||item.bulan}${item.angsur ? ' (angsur Rp ' + fmt(item.amount) + ')' : ''} dibatalkan`);
        }
        if (item.item_id && item.item_id !== 'spp') {
          const t = findTagihan(kwt.nama, item.item_id);
          if (t) {
            tagihanUpdates.push({ id: t.id, delta: -item.amount });
            keteranganKoreksi.push(`${item.name} Rp ${fmt(item.amount)} dibatalkan`);
          }
        }
      } else if (aksi === 'koreksi_nilai') {
        const selisih = nilaBaru - item.amount;
        keteranganKoreksi.push(`${item.name}${item.bulan?' ('+(MONTH_FULL[item.bulan]||item.bulan)+')':''}: Rp ${fmt(item.amount)} → Rp ${fmt(nilaBaru)}`);
        // SPP berbulan: nominal terbayar bulan itu ikut digeser sebesar selisihnya
        // (mis. angsur 150rb dikoreksi jadi 100rb → bulan itu kurang 50rb lagi).
        if (item.bulan && selisih) {
          const op = sppDeltaOp(item, selisih);
          if (op.cur)  sppOps.cur.push(op.cur);
          if (op.hist) sppOps.hist.push(op.hist);
        }
        if (item.item_id && item.item_id !== 'spp') {
          const t = findTagihan(kwt.nama, item.item_id);
          if (t) tagihanUpdates.push({ id: t.id, delta: selisih });
        }
      }
    });

    // Update SPP months di siswa & Supabase
    if (sppOps.cur.length || sppOps.hist.length) await commitSppOps(kwt.nama, sppOps);
    // Update tagihan paid_amount
    for (const u of tagihanUpdates) {
      await addTagihanPaid(u.id, u.delta);
    }

    // === 2. Buat kuitansi koreksi baru ===
    let noKoreksi = await generateNoKuitansi();
    const catatanKoreksi = (catatan ? catatan + ' · ' : '') + 'Koreksi atas ' + kwt.no_kuitansi + ': ' + keteranganKoreksi.join('; ');
    const itemsKoreksi = koreksiItems.map(({ item, aksi, nilaBaru }) => ({
      name: item.name + (item.bulan ? ' (' + (MONTH_FULL[item.bulan]||item.bulan) + ')' : ''),
      amount: aksi === 'batalkan' ? item.amount : nilaBaru,
      bulan: item.bulan || null,
      // Dibawa agar menghapus kuitansi koreksi ini bisa mengembalikan efeknya
      // ke tempat yang benar (angsuran / tunggakan TA lama).
      ...(item.ta ? { ta: item.ta } : {}),
      ...(item.angsur ? { angsur: true } : {}),
      ...(item.rate ? { rate: item.rate } : {}),
      // Selisih koreksi nilai, dipakai untuk membaliknya bila kuitansi koreksi dihapus.
      ...(aksi === 'koreksi_nilai' && item.bulan ? { selisih: nilaBaru - item.amount } : {}),
      _tipe: aksi,
      _dibatalkan: aksi === 'batalkan',
      _koreksi: aksi === 'koreksi_nilai',
    }));
    const totalKoreksi = itemsKoreksi.reduce((s, i) => s + i.amount, 0);

    const kwtKoreksiData = {
      no_kuitansi: noKoreksi,
      nama: kwt.nama, kelas: kwt.kelas, nisn: kwt.nisn || '',
      items: itemsKoreksi,
      total: totalKoreksi,
      catatan: catatanKoreksi,
      is_koreksi: true,
      ref_no_kuitansi: kwt.no_kuitansi,
      dicetak: false,
      ta_label: getProfil().ta || '',
    };
    const resKoreksi = await insertKuitansi(kwtKoreksiData);
    noKoreksi = kwtKoreksiData.no_kuitansi;   // bisa berganti bila nomornya bentrok

    // === 3. Tandai kuitansi lama sebagai "dikoreksi" ===
    await sb('kuitansi?id=eq.' + kwt.id, 'PATCH', {
      dikoreksi_oleh: noKoreksi,
    }, { 'Prefer': 'return=minimal' });

    // === 4. Refresh & cetak kuitansi koreksi ===
    // (siswa sudah di-PATCH langsung ke Supabase)
    renderSiswaTable();
    renderTunggakan();
    renderDashboard();

    closeKoreksiModal();
    if (typeof loadRiwayatKuitansi === 'function') loadRiwayatKuitansi();
    toast('✅ Koreksi berhasil! Kuitansi koreksi ' + noKoreksi + ' dibuat.');

    // Tawarkan cetak kuitansi koreksi
    const kwtKoreksi = resKoreksi?.[0] || { no_kuitansi: noKoreksi, nama: kwt.nama, items: itemsKoreksi, total: totalKoreksi, catatan: catatanKoreksi, is_koreksi: true, ref_no_kuitansi: kwt.no_kuitansi };
    setTimeout(() => {
      pendingKwtData = { ...kwtKoreksi, time: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) };
      pendingKwtId = resKoreksi?.[0]?.id || null;
      document.getElementById('modalCetakNama').textContent = kwt.nama + ' — Koreksi';
      document.getElementById('modalCetakTotal').textContent = 'Koreksi ' + kwt.no_kuitansi;
      document.getElementById('modalCetakKwt').style.display = 'flex';
    }, 300);

  } catch(e) {
    toast('⚠️ Gagal koreksi: ' + e.message);
    showKoreksiInlineStep(3);
  }
}

// ══════════════════════════════════════════
;// ══ js/template-kuitansi.js ══
// ── SiPay · Template Kuitansi ──
// TEMPLATE KUITANSI
// ══════════════════════════════════════════
const KT_DEFAULT = {
  nama: '', alamat: '', kontak: '',
  warna: '#1e5631', warna_arsip: '#1d4ed8',
  fontsize: '11', judul: 'KUITANSI PEMBAYARAN', prefix: 'KWT',
  show_logo: true, show_nisn: true, show_nokwt: true,
  show_terbilang: true, show_ttd: true, show_catatan: true,
  ttd_kiri: 'Bendahara / Admin', ttd_kanan: '',
  use_ttd_online: false, ttd_online_img: '',
  footer: '',
};
let ktData = { ...KT_DEFAULT };

async function loadTemplateKuitansi() {
  try {
    const rows = await sb('settings?select=*&key=eq.kuitansi_template');
    if (rows.length && rows[0].value) {
      ktData = { ...KT_DEFAULT, ...rows[0].value };
    }
  } catch(e) { console.warn('loadTemplateKuitansi:', e.message); }
}

async function saveTemplateKuitansi() {
  // Baca dari form
  ktData = {
    nama:           document.getElementById('kt_nama').value.trim(),
    alamat:         document.getElementById('kt_alamat').value.trim(),
    kontak:         document.getElementById('kt_kontak').value.trim(),
    warna:          document.getElementById('kt_warna').value,
    warna_arsip:    document.getElementById('kt_warna_arsip').value,
    fontsize:       document.getElementById('kt_fontsize').value,
    judul:          document.getElementById('kt_judul').value.trim() || 'KUITANSI PEMBAYARAN',
    prefix:         (document.getElementById('kt_prefix').value.trim() || 'KWT').toUpperCase(),
    show_logo:      document.getElementById('kt_show_logo').checked,
    show_nisn:      document.getElementById('kt_show_nisn').checked,
    show_nokwt:     document.getElementById('kt_show_nokwt').checked,
    show_terbilang: document.getElementById('kt_show_terbilang').checked,
    show_ttd:       document.getElementById('kt_show_ttd').checked,
    show_catatan:   document.getElementById('kt_show_catatan').checked,
    ttd_kiri:       document.getElementById('kt_ttd_kiri').value.trim(),
    ttd_kanan:      document.getElementById('kt_ttd_kanan').value.trim(),
    use_ttd_online: document.getElementById('kt_use_ttd_online').checked,
    ttd_online_img: document.getElementById('kt_use_ttd_online').checked ? (ktData.ttd_online_img || '') : '',
    footer:         document.getElementById('kt_footer').value.trim(),
  };
  const statusEl = document.getElementById('kt_saveStatus');
  statusEl.textContent = '⏳ Menyimpan...';
  try {
    await sb('settings?on_conflict=key', 'POST',
      [{ key: 'kuitansi_template', value: ktData }],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    statusEl.textContent = '✅ Template berhasil disimpan!';
    setTimeout(() => statusEl.textContent = '', 3000);
    toast('✅ Template kuitansi disimpan!');
    renderKTPreview();
  } catch(e) {
    statusEl.textContent = '❌ Gagal: ' + e.message;
  }
}

function resetTemplateKuitansi() {
  if (!confirm('Reset ke template default? Semua pengaturan akan kembali ke bawaan.')) return;
  ktData = { ...KT_DEFAULT };
  isiFormKT();
  renderKTPreview();
}

function isiFormKT() {
  document.getElementById('kt_nama').value        = ktData.nama || '';
  document.getElementById('kt_alamat').value      = ktData.alamat || '';
  document.getElementById('kt_kontak').value      = ktData.kontak || '';
  document.getElementById('kt_warna').value       = ktData.warna || '#1e5631';
  document.getElementById('kt_warna_hex').value   = ktData.warna || '#1e5631';
  document.getElementById('kt_warna_arsip').value     = ktData.warna_arsip || '#1d4ed8';
  document.getElementById('kt_warna_arsip_hex').value = ktData.warna_arsip || '#1d4ed8';
  document.getElementById('kt_fontsize').value    = ktData.fontsize || '11';
  document.getElementById('kt_judul').value       = ktData.judul || 'KUITANSI PEMBAYARAN';
  document.getElementById('kt_prefix').value      = ktData.prefix || 'KWT';
  document.getElementById('kt_show_logo').checked      = ktData.show_logo !== false;
  document.getElementById('kt_show_nisn').checked      = ktData.show_nisn !== false;
  document.getElementById('kt_show_nokwt').checked     = ktData.show_nokwt !== false;
  document.getElementById('kt_show_terbilang').checked = ktData.show_terbilang !== false;
  document.getElementById('kt_show_ttd').checked       = ktData.show_ttd !== false;
  document.getElementById('kt_show_catatan').checked   = ktData.show_catatan !== false;
  document.getElementById('kt_ttd_kiri').value    = ktData.ttd_kiri || '';
  document.getElementById('kt_ttd_kanan').value   = ktData.ttd_kanan || '';
  document.getElementById('kt_use_ttd_online').checked = ktData.use_ttd_online || false;
  toggleTTDOnline();
  if (ktData.ttd_online_img) {
    const prev = document.getElementById('kt_ttd_preview');
    if (prev) prev.innerHTML = `<img src="${ktData.ttd_online_img}" class="img-fit">`;
    const hapusBtn = document.getElementById('kt_ttd_hapus');
    if (hapusBtn) hapusBtn.style.display = 'inline-flex';
  }
  document.getElementById('kt_footer').value      = ktData.footer || '';
}

function syncColorHex() {
  const hex = document.getElementById('kt_warna_hex').value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('kt_warna').value = hex;
  }
  renderKTPreview();
}

function syncColorHexArsip() {
  const hex = document.getElementById('kt_warna_arsip_hex').value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('kt_warna_arsip').value = hex;
  }
  renderKTPreview();
}

// Auto preview on any change
function initKTListeners() {
  ['kt_nama','kt_alamat','kt_kontak','kt_warna_hex','kt_warna_arsip_hex','kt_fontsize','kt_judul','kt_prefix',
   'kt_ttd_kiri','kt_ttd_kanan','kt_footer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderKTPreview);
  });
  document.getElementById('kt_warna').addEventListener('input', function() {
    document.getElementById('kt_warna_hex').value = this.value;
    renderKTPreview();
  });
  document.getElementById('kt_warna_arsip')?.addEventListener('input', function() {
    document.getElementById('kt_warna_arsip_hex').value = this.value;
    renderKTPreview();
  });
  ['kt_show_logo','kt_show_nisn','kt_show_nokwt','kt_show_terbilang',
   'kt_show_ttd','kt_show_catatan'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderKTPreview);
  });
}

function getKTFromForm() {
  return {
    nama:           document.getElementById('kt_nama')?.value?.trim() || '',
    alamat:         document.getElementById('kt_alamat')?.value?.trim() || '',
    kontak:         document.getElementById('kt_kontak')?.value?.trim() || '',
    warna:          document.getElementById('kt_warna')?.value || '#1e5631',
    warna_arsip:    document.getElementById('kt_warna_arsip')?.value || '#1d4ed8',
    fontsize:       document.getElementById('kt_fontsize')?.value || '11',
    judul:          document.getElementById('kt_judul')?.value?.trim() || 'KUITANSI PEMBAYARAN',
    prefix:         (document.getElementById('kt_prefix')?.value?.trim() || 'KWT').toUpperCase(),
    show_logo:      document.getElementById('kt_show_logo')?.checked ?? true,
    show_nisn:      document.getElementById('kt_show_nisn')?.checked ?? true,
    show_nokwt:     document.getElementById('kt_show_nokwt')?.checked ?? true,
    show_terbilang: document.getElementById('kt_show_terbilang')?.checked ?? true,
    show_ttd:       document.getElementById('kt_show_ttd')?.checked ?? true,
    show_catatan:   document.getElementById('kt_show_catatan')?.checked ?? true,
    ttd_kiri:       document.getElementById('kt_ttd_kiri')?.value?.trim() || '',
    ttd_kanan:      document.getElementById('kt_ttd_kanan')?.value?.trim() || '',
    use_ttd_online: document.getElementById('kt_use_ttd_online')?.checked || false,
    ttd_online_img: (document.getElementById('kt_use_ttd_online')?.checked) ? (ktData.ttd_online_img || '') : '',
    footer:         document.getElementById('kt_footer')?.value?.trim() || '',
  };
}

function toggleTTDOnline() {
  const checked = document.getElementById('kt_use_ttd_online')?.checked;
  const area = document.getElementById('kt_ttd_online_area');
  if (area) area.style.display = checked ? 'block' : 'none';
  renderKTPreview();
}

function previewTTDOnline(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 1 * 1024 * 1024) { toast('⚠️ Ukuran TTD maksimal 1MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    ktData.ttd_online_img = e.target.result;
    const prev = document.getElementById('kt_ttd_preview');
    if (prev) {
      prev.innerHTML = `<img src="${e.target.result}" class="img-fit">`;
      prev.style.borderStyle = 'solid';
      prev.style.borderColor = 'var(--primary-light)';
    }
    const hapusBtn = document.getElementById('kt_ttd_hapus');
    if (hapusBtn) hapusBtn.style.display = 'inline-flex';
    renderKTPreview();
  };
  reader.readAsDataURL(file);
}

function hapusTTDOnline() {
  ktData.ttd_online_img = '';
  const prev = document.getElementById('kt_ttd_preview');
  if (prev) {
    prev.innerHTML = '<span class="hint text-center">✍️ Klik upload<br>gambar TTD</span>';
    prev.style.borderStyle = 'dashed';
    prev.style.borderColor = 'var(--border)';
  }
  const hapusBtn = document.getElementById('kt_ttd_hapus');
  if (hapusBtn) hapusBtn.style.display = 'none';
  document.getElementById('kt_ttd_input').value = '';
  renderKTPreview();
}

// Generate nomor kuitansi: PREFIX-MMYYYY-XXXX (auto-increment, reset tiap bulan)
async function generateNoKuitansi() {
  const now    = new Date();
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy   = now.getFullYear();
  const bulan  = mm + yyyy; // misal: 032026
  const prefix = (ktData.prefix || 'KWT').toUpperCase();
  const pattern = prefix + '-' + bulan + '-';

  try {
    // Ambil nomor terakhir bulan ini dari Supabase
    // Supabase REST: ilike untuk case-insensitive, * sebagai wildcard
    const rows = await sb(
      'kuitansi?select=no_kuitansi&no_kuitansi=ilike.' + pattern + '*&order=no_kuitansi.desc&limit=1'
    );
    let urutan = 1;
    if (rows.length) {
      const last = rows[0].no_kuitansi; // misal KWT-032026-0012
      const parts = last.split('-');
      const lastNum = parseInt(parts[parts.length - 1]) || 0;
      urutan = lastNum + 1;
    }
    return pattern + String(urutan).padStart(4, '0');
  } catch {
    // Fallback jika Supabase belum siap
    return pattern + String(Date.now()).slice(-4);
  }
}

function renderKTPreview() {
  const el = document.getElementById('kt_preview');
  if (!el) return;
  const kt = getKTFromForm();
  // Pakai data siswa pertama yang ada, atau data contoh
  const siswaContoh = appState.students[0] || null;
  const prefix = kt.prefix || 'KWT';
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const noContoh = `${prefix}-${mm}${now.getFullYear()}-0001`;
  const contoh = {
    nama:    siswaContoh ? siswaContoh.nama  : 'Nama Santri Contoh',
    kelas:   siswaContoh ? siswaContoh.kelas : '—',
    nisn:    siswaContoh ? (siswaContoh.nisn || '—') : '—',
    items:   [{ name: 'SPP', amount: siswaContoh ? siswaContoh.spp||250000 : 250000, bulan: 'Jan' },
              { name: 'Uang Pangkal', amount: 500000, bulan: null }],
    total:   siswaContoh ? (siswaContoh.spp||250000) + 500000 : 750000,
    time:    new Date().toLocaleDateString('id-ID') + ' 08:30',
    catatan: 'Pembayaran bulan Januari',
    metode:  'tunai',
    dibayar_oleh: 'Orang Tua Santri',
    no_kuitansi: noContoh,
  };
  el.innerHTML = `<style>${KWT_CSS}</style>` + buildKuitansiHTML(contoh, kt, 'Lembar Pembayar')
    + '<div class="kwt-sep"></div>'
    + buildKuitansiHTML(contoh, kt, 'Lembar Arsip');
}

// Ubah warna hex jadi rgba dengan alpha tertentu (untuk latar tipis pembeda lembar)
function ktTint(hex, alpha) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ── Builder kuitansi HTML (dipakai preview & cetak) ──
function buildKuitansiHTML(data, kt, label) {
  const profil   = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const logoB64  = localStorage.getItem('sipay_logo') || '';
  const w        = kt.warna || '#1e5631';
  const fs       = Number(kt.fontsize || 11);
  const namaLbg  = kt.nama  || profil.nama    || 'Madrasah Terpadu';
  const alamatLbg = kt.alamat || profil.alamat || '';
  const kontakLbg = kt.kontak || profil.kontak || '';
  const fmt      = n => Number(n||0).toLocaleString('id-ID');
  // Pakai no_kuitansi yang sudah di-generate, fallback ke format lama
  const noKwt     = data.no_kuitansi || data._noKwt || ((kt.prefix||'KWT') + '-' + Date.now().toString().slice(-6));
  const isKoreksi = !!data.is_koreksi;

  // Warna pembeda: lembar pembayar pakai warna utama, lembar arsip pakai
  // warna arsip. Kuitansi koreksi tetap oranye pada kedua lembar.
  const isArsip     = /arsip/i.test(label || '');
  const wArsip      = kt.warna_arsip || '#1d4ed8';
  const warnaBorder = isKoreksi ? '#b45309' : (isArsip ? wArsip : w);
  const bgLembar    = isKoreksi ? '#fff' : ktTint(warnaBorder, 0.045);
  const bgTotal     = isKoreksi ? '#fef9c3' : ktTint(warnaBorder, 0.10);

  // Lembar arsip diberi kotak kosong 2 cm x 0,5 cm tepat di atas label
  // "LEMBAR ARSIP" (jarak 0,2 cm) untuk catatan tulis tangan petugas.
  const ruangArsipHtml = isArsip ? `<div class="k-arsip-box"></div>` : '';

  const logoHtml = (kt.show_logo && logoB64)
    ? `<img class="k-logo" src="${safeUrl(logoB64)}">`
    : (kt.show_logo ? `<div class="k-logo-ph">🕌</div>` : '');

  const itemRows = data.items.map(i => {
    const dibatalkan = i._dibatalkan || (i._tipe === 'batalkan');
    const dikoreksi  = i._koreksi || i._tipe === 'koreksi_nilai';
    const rowCls     = dibatalkan ? ' class="k-row-batal"' : dikoreksi ? ' class="k-row-koreksi"' : '';
    const badge      = dibatalkan
      ? ' <span class="k-badge k-badge-batal">DIBATALKAN</span>'
      : dikoreksi
      ? ' <span class="k-badge k-badge-koreksi">KOREKSI</span>' : '';
    const namaItem = i.name + (i.bulan && !i.name.includes('(') ? ' (' + (MONTH_FULL[i.bulan]||i.bulan) + ')' : '');
    return `<tr${rowCls}>
      <td class="k-cell">${esc(namaItem)}${badge}</td>
      <td class="k-cell k-num">${dibatalkan ? '<s>Rp '+fmt(i.amount)+'</s>' : 'Rp '+fmt(i.amount)}</td>
    </tr>`;
  }).join('');

  // TTD section
  let ttdHtml = '';
  if (kt.show_ttd) {
    const kiri  = kt.ttd_kiri  || 'Bendahara / Admin';
    const kanan = kt.ttd_kanan || '';
    const ttdImgHtml = (kt.use_ttd_online && kt.ttd_online_img)
      ? `<img class="k-ttd-img" src="${safeUrl(kt.ttd_online_img)}">`
      : `<div class="k-ttd-space"></div>`;
    const blok = (role, img) => `<div class="k-ttd-blok">
      <div class="k-ttd-role">${esc(role)}</div>
      ${img}
      <div class="k-ttd-line"></div>
      <div class="k-ttd-cap">(Tanda Tangan)</div>
    </div>`;
    const blokKiri  = blok(kiri, ttdImgHtml);
    const blokKanan = kanan ? blok(kanan, `<div class="k-ttd-space"></div>`) : '';

    ttdHtml = `<div class="k-ttd${kanan ? ' split' : ''}">
      ${kanan ? blokKiri : ''}
      ${kanan ? blokKanan : blokKiri}
    </div>`;
  }

  // Warna & ukuran huruf dari template dikirim lewat variabel CSS (lihat KWT_CSS)
  return `
  <div class="kwt" style="--kw:${warnaBorder};--kfs:${fs}px;--kbg:${bgLembar};--kbgt:${bgTotal};">
    <!-- Header -->
    <div class="k-head">
      ${logoHtml}
      <div class="k-head-mid">
        <div class="k-nama">${esc(namaLbg)}</div>
        ${alamatLbg ? `<div class="k-sub">${esc(alamatLbg)}</div>` : ''}
        ${kontakLbg ? `<div class="k-sub">${esc(kontakLbg)}</div>` : ''}
      </div>
      <div class="k-head-right">
        ${ruangArsipHtml}
        <span class="k-label">${label}</span>
      </div>
    </div>

    <!-- Judul -->
    <div class="k-judul-wrap">
      <div class="k-judul">
        ${isKoreksi ? 'KUITANSI KOREKSI' : esc(kt.judul)}
      </div>
      ${isKoreksi && data.ref_no_kuitansi ? `<div class="k-ref">📋 Koreksi atas Kuitansi No. <strong>${esc(data.ref_no_kuitansi)}</strong></div>` : ''}
    </div>

    <!-- Info -->
    <table class="k-info">
      ${kt.show_nokwt ? `<tr><td class="k-c-label">No. Kuitansi</td><td class="k-c-sep">:</td><td class="k-b">${esc(noKwt)}</td><td class="k-c-label2">Tanggal</td><td class="k-c-sep">:</td><td class="k-b">${esc(data.time)}</td></tr>` : `<tr><td colspan="6" class="k-tgl">Tanggal: ${esc(data.time)}</td></tr>`}
      <tr><td class="k-pad">Nama Santri</td><td>:</td><td class="k-b" colspan="4">${esc(data.nama)}</td></tr>
      <tr><td class="k-pad">Kelas</td><td>:</td><td colspan="4">${esc(data.kelas)}${kt.show_nisn && data.nisn ? ' &nbsp;|&nbsp; NISN: ' + esc(data.nisn) : ''}</td></tr>
      ${data.metode ? `<tr><td class="k-pad">Metode</td><td>:</td><td colspan="4">${data.metode === 'transfer' ? '🏦 Transfer' : '💵 Tunai'}${data.dibayar_oleh ? ' &nbsp;|&nbsp; Dibayar oleh: <strong>' + esc(data.dibayar_oleh) + '</strong>' : ''}</td></tr>` : (data.dibayar_oleh ? `<tr><td class="k-pad">Dibayar oleh</td><td>:</td><td colspan="4"><strong>${esc(data.dibayar_oleh)}</strong></td></tr>` : '')}
      ${kt.show_catatan && data.catatan ? `<tr><td class="k-pad">Keterangan</td><td>:</td><td colspan="4" class="k-i">${esc(data.catatan)}</td></tr>` : ''}
    </table>

    <!-- Item -->
    <table class="k-items">
      <thead><tr class="k-items-head">
        <th class="k-th">Rincian Pembayaran</th>
        <th class="k-th k-num">Nominal</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr class="k-total">
        <td class="k-tcell">TOTAL</td>
        <td class="k-tcell k-num k-tamt">Rp ${fmt(data.total)}</td>
      </tr></tfoot>
    </table>

    ${kt.show_terbilang ? `<div class="k-terbilang"><strong>Terbilang:</strong> <em>${terbilangFull(data.total)}</em></div>` : ''}

    ${ttdHtml}

    ${kt.footer ? `<div class="k-footer">${esc(kt.footer)}</div>` : ''}
  </div>`;
}

// Gaya kuitansi — satu sumber untuk preview di aplikasi & jendela cetak
// (jendela cetak tidak memuat main.css). Selektor diawali .kwt supaya
// menang atas gaya tabel umum aplikasi saat dipreview.
const KWT_CSS = `
.kwt { width:100%; border:2px solid var(--kw); border-radius:8px; padding:12px 16px; font-family:'Times New Roman',serif; box-sizing:border-box; background:var(--kbg); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.kwt .k-head { display:flex; align-items:center; gap:10px; border-bottom:2px solid var(--kw); padding-bottom:8px; margin-bottom:8px; }
.kwt .k-head-mid { flex:1; text-align:center; }
.kwt .k-head-right { text-align:right; min-width:80px; }
.kwt .k-logo { width:52px; height:52px; object-fit:contain; }
.kwt .k-logo-ph { width:52px; height:52px; background:#e8f5e9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0; }
.kwt .k-nama { font-size:calc(var(--kfs) + 4px); font-weight:700; color:var(--kw); }
.kwt .k-sub { font-size:calc(var(--kfs) - 1px); color:#555; }
.kwt .k-arsip-box { width:2cm; height:0.5cm; margin:0 0 0.2cm auto; border:1px solid #bbb; box-sizing:border-box; }
.kwt .k-label { background:var(--kw); color:#fff; padding:3px 8px; border-radius:4px; font-size:calc(var(--kfs) - 1px); font-weight:700; }
.kwt .k-judul-wrap { text-align:center; margin-bottom:8px; }
.kwt .k-judul { font-size:calc(var(--kfs) + 2px); font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--kw); }
.kwt .k-ref { font-size:calc(var(--kfs) - 1px); color:#b45309; margin-top:3px; font-family:sans-serif; }
.kwt .k-info { width:100%; font-size:var(--kfs); margin-bottom:8px; border-collapse:collapse; }
.kwt .k-c-label { width:28%; padding:2px 0; }
.kwt .k-c-sep { width:2%; }
.kwt .k-c-label2 { width:24%; text-align:right; }
.kwt .k-pad { padding:2px 0; }
.kwt .k-b { font-weight:700; }
.kwt .k-i { font-style:italic; }
.kwt .k-tgl { text-align:right; padding:2px 0; font-size:calc(var(--kfs) - 1px); color:#666; }
.kwt .k-items { width:100%; border-collapse:collapse; margin-bottom:6px; }
.kwt .k-items-head { background:var(--kw); color:#fff; }
.kwt .k-th { padding:5px 8px; border:1px solid var(--kw); text-align:left; font-size:var(--kfs); }
.kwt .k-cell { padding:4px 8px; border:1px solid #ddd; font-size:var(--kfs); }
.kwt .k-row-batal { color:#dc2626; }
.kwt .k-row-koreksi { color:#b45309; font-weight:600; }
.kwt .k-badge { font-size:9px; padding:1px 5px; border-radius:3px; font-family:sans-serif; }
.kwt .k-badge-batal { background:#fef2f2; color:#dc2626; }
.kwt .k-badge-koreksi { background:#fef9c3; color:#b45309; }
.kwt .k-total { background:var(--kbgt); font-weight:700; }
.kwt .k-tcell { padding:5px 8px; border:1px solid #ddd; font-size:var(--kfs); }
.kwt .k-num { text-align:right; }
.kwt .k-tamt { font-size:calc(var(--kfs) + 1px); color:var(--kw); }
.kwt .k-terbilang { background:#f9f9f9; border:1px dashed #ccc; border-radius:5px; padding:5px 8px; font-size:calc(var(--kfs) - 1px); margin-bottom:8px; }
.kwt .k-ttd { display:flex; justify-content:flex-end; font-size:var(--kfs); margin-top:10px; }
.kwt .k-ttd.split { justify-content:space-between; }
.kwt .k-ttd-blok { min-width:130px; text-align:center; }
.kwt .k-ttd-role { margin-bottom:4px; }
.kwt .k-ttd-img { height:40px; max-width:130px; object-fit:contain; display:block; margin:0 auto; }
.kwt .k-ttd-space { height:40px; }
.kwt .k-ttd-line { border-bottom:1.5px solid #333; width:130px; margin:0 auto; }
.kwt .k-ttd-cap { margin-top:4px; font-size:calc(var(--kfs) - 1px); color:#555; }
.kwt .k-footer { margin-top:8px; text-align:center; font-size:calc(var(--kfs) - 1px); color:#888; border-top:1px solid #eee; padding-top:6px; }
.kwt-sep { border-top:2px dashed #aaa; margin:10px 0; }
`;

// Render halaman template kuitansi
async function renderTemplateKuitansiPage() {
  await loadTemplateKuitansi();
  // Tunggu DOM siap (halaman baru saja di-show)
  setTimeout(() => {
    isiFormKT();
    initKTListeners();
    renderKTPreview();
  }, 50);
}
const SB_STORAGE_URL = SB_URL + '/storage/v1/object/public/bukti-pembayaran/';
const SB_UPLOAD_URL  = SB_URL + '/storage/v1/object/bukti-pembayaran/';
let laporanFilter = 'pending';
let laporBuktiFile = null;

// ── Render halaman lapor (wali) ──
;// ══ js/spmb.js ══
// ── SiPay · SPMB (Sistem Penerimaan Murid Baru) ──

let spmbSelectedRows = new Set();

// Nominal & terbayar pangkal calon — utamakan tagihan (persisten & otomatis
// terbawa saat promosi jadi santri aktif); fallback field lama bila belum ada.
function _calonPangkal(c) {
  const t = (typeof findTagihan === 'function') ? findTagihan(c.nama, 'pangkal') : null;
  return t
    ? { nominal: t.nominal || 0, paid: t.paid_amount || 0 }
    : { nominal: c.pangkal || 0, paid: c.pangkal_paid || 0 };
}
// Idem untuk uang pendaftaran calon (tagihan-first, fallback field lama).
function _calonPendaftaran(c) {
  const t = (typeof findTagihan === 'function') ? findTagihan(c.nama, 'pendaftaran') : null;
  return t
    ? { nominal: t.nominal || 0, paid: t.paid_amount || 0 }
    : { nominal: c.uang_pendaftaran || 0, paid: c.uang_pendaftaran_paid || 0 };
}

// ══════════════════════════════════════════
// RENDER HALAMAN SPMB
// ══════════════════════════════════════════
function renderSpmbPage() {
  const calonList = _getCalonList();
  _renderSpmbStats(calonList);
  _renderSpmbTable(calonList);
  _updateSpmbBulkBar();
}

function _getCalonList() {
  const q = (document.getElementById('searchSpmb')?.value || '').toLowerCase().trim();
  return appState.students
    .filter(s => s.status_kelulusan === 'calon')
    .filter(s => !q || s.nama.toLowerCase().includes(q) || (s.nisn && s.nisn.includes(q)))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

function _renderSpmbStats(list) {
  const el = document.getElementById('spmbStats');
  if (!el) return;
  const totalCalon = list.length;
  const totalPendaftaran = list.reduce((s, c) => s + _calonPendaftaran(c).paid, 0);
  const totalPangkal = list.reduce((s, c) => s + _calonPangkal(c).paid, 0);
  const totalSisaPendaftaran = list.reduce((s, c) => s + pendaftaranTunggakan(c), 0);

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon bg-accent-pale text-accent"><svg class="ic"><use href="#i-star"/></svg></div>
      <div class="stat-info">
        <div class="stat-label">Total Calon Santri</div>
        <div class="stat-value">${totalCalon} orang</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-primary-pale text-primary-light"><svg class="ic"><use href="#i-card"/></svg></div>
      <div class="stat-info">
        <div class="stat-label">Terkumpul Pendaftaran</div>
        <div class="stat-value fs-15">${rp(totalPendaftaran)}</div>
        ${totalSisaPendaftaran > 0 ? `<div class="fs-12 text-danger mt-2">Sisa: ${rp(totalSisaPendaftaran)}</div>` : ''}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon bg-primary-pale text-primary-light"><svg class="ic"><use href="#i-bank"/></svg></div>
      <div class="stat-info">
        <div class="stat-label">Terkumpul Pangkal</div>
        <div class="stat-value fs-15">${rp(totalPangkal)}</div>
      </div>
    </div>
  `;
}

function _renderSpmbTable(list) {
  const tbody = document.getElementById('spmbTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td class="text-center p-32 text-muted" colspan="8">
      Belum ada calon santri.<br>
      <span class="fs-12">Klik <strong>Tambah Calon</strong> atau <strong>Import Excel</strong> untuk mulai.</span>
    </td></tr>`;
    const chkAll = document.getElementById('spmbChkAll');
    if (chkAll) chkAll.checked = false;
    return;
  }

  tbody.innerHTML = list.map((s, i) => {
    const _pd = _calonPendaftaran(s);
    const sisaPendaftaran = Math.max(0, _pd.nominal - _pd.paid);
    const _pk = _calonPangkal(s);
    const sisaPangkal = Math.max(0, _pk.nominal - _pk.paid);
    const pendaftaranOk = sisaPendaftaran <= 0 && _pd.nominal > 0;
    const pangkalOk = sisaPangkal <= 0 && _pk.nominal > 0;
    const sel = spmbSelectedRows.has(s.nama);
    const nameSafe = escJs(s.nama);

    const pendaftaranBadge = _pd.nominal > 0
      ? (pendaftaranOk
        ? `<span class="fs-12 fw-700 text-primary-light"><svg class="ic"><use href="#i-check"/></svg> Lunas</span>`
        : `<div class="fs-12">${rp(_pd.paid)} / ${rp(_pd.nominal)}</div>
           <div class="fs-12 text-danger">Sisa ${rp(sisaPendaftaran)}</div>`)
      : `<span class="hint">—</span>`;

    const pangkalBadge = _pk.nominal > 0
      ? (pangkalOk
        ? `<span class="fs-12 fw-700 text-primary-light"><svg class="ic"><use href="#i-check"/></svg> Lunas</span>`
        : `<div class="fs-12">${rp(_pk.paid)} / ${rp(_pk.nominal)}</div>
           <div class="fs-12 text-danger">Sisa ${rp(sisaPangkal)}</div>`)
      : `<span class="hint">—</span>`;

    const sppLabel = s.spp > 0
      ? `<span class="fw-600">${rp(s.spp)}</span>`
      : `<span class="hint">—</span>`;

    return `<tr>
      <td><input type="checkbox" class="spmb-row-chk w-15 h-15 accent-primary" data-nama="${esc(s.nama)}"
        ${sel ? 'checked' : ''} onchange="toggleSpmbRowSelect(this)"
       ></td>
      <td>${i + 1}</td>
      <td>
        <div class="fw-600 fs-13">${esc(s.nama)}</div>
        ${s.nisn ? `<div class="hint">NISN: ${esc(s.nisn)}</div>` : ''}
      </td>
      <td><span class="fw-700 fs-14">Kelas ${esc(s.kelas)}</span></td>
      <td>${sppLabel}</td>
      <td>${pendaftaranBadge}</td>
      <td>${pangkalBadge}</td>
      <td class="nowrap">
        <button class="btn btn-sm btn-accent fs-12" onclick="confirmPromoteSingle('${nameSafe}')" title="Promosikan ke siswa aktif"><svg class="ic"><use href="#i-grad"/></svg> Promosi</button>
        <button class="btn btn-sm btn-outline fs-12" onclick="openEditCalonModal('${nameSafe}')" title="Edit data"><svg class="ic"><use href="#i-edit"/></svg> Edit</button>
        <button class="btn btn-sm btn-danger act-del fs-12" onclick="deleteCalonSantri('${nameSafe}')" title="Hapus"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>
      </td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════
// BULK SELECTION
// ══════════════════════════════════════════
function toggleSpmbSelectAll(chk) {
  const allChks = document.querySelectorAll('.spmb-row-chk');
  allChks.forEach(c => {
    c.checked = chk.checked;
    if (chk.checked) spmbSelectedRows.add(c.dataset.nama);
    else spmbSelectedRows.delete(c.dataset.nama);
  });
  _updateSpmbBulkBar();
}

function toggleSpmbRowSelect(chk) {
  if (chk.checked) spmbSelectedRows.add(chk.dataset.nama);
  else spmbSelectedRows.delete(chk.dataset.nama);
  const allChks = document.querySelectorAll('.spmb-row-chk');
  const chkAll = document.getElementById('spmbChkAll');
  if (chkAll) chkAll.checked = allChks.length > 0 && [...allChks].every(c => c.checked);
  _updateSpmbBulkBar();
}

function _updateSpmbBulkBar() {
  const bar = document.getElementById('spmbBulkBar');
  const promBtn = document.getElementById('spmbPromoteBtn');
  if (spmbSelectedRows.size > 0) {
    if (bar) bar.classList.add('show');
    document.getElementById('spmbBulkCount').textContent = spmbSelectedRows.size + ' calon dipilih';
  } else {
    if (bar) bar.classList.remove('show');
  }
  if (promBtn) promBtn.disabled = spmbSelectedRows.size === 0;
}

function clearSpmbSelection() {
  spmbSelectedRows.clear();
  document.querySelectorAll('.spmb-row-chk').forEach(c => c.checked = false);
  const chkAll = document.getElementById('spmbChkAll');
  if (chkAll) chkAll.checked = false;
  _updateSpmbBulkBar();
}

// ══════════════════════════════════════════
// TAMBAH CALON SANTRI
// ══════════════════════════════════════════
function openAddCalonModal() {
  ['calon_nama','calon_nisn','calon_spp','calon_pendaftaran','calon_pangkal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('calon_kelas').value = '';
  document.getElementById('addCalonModal').classList.add('open');
  setTimeout(() => document.getElementById('calon_nama')?.focus(), 100);
}

async function saveCalonSantri() {
  const nama = (document.getElementById('calon_nama').value || '').trim().toUpperCase();
  const kelas = document.getElementById('calon_kelas').value;
  if (!nama) { toast('⚠️ Nama calon santri wajib diisi!'); return; }
  if (!kelas) { toast('⚠️ Kelas target wajib dipilih!'); return; }

  if (appState.students.find(s => s.nama === nama)) {
    toast('⚠️ Nama sudah ada di data santri!'); return;
  }

  const nisn = (document.getElementById('calon_nisn').value || '').trim();
  const spp = Number(document.getElementById('calon_spp').value) || 0;
  const uang_pendaftaran = Number(document.getElementById('calon_pendaftaran').value) || 0;
  const pangkal = Number(document.getElementById('calon_pangkal').value) || 0;

  const newCalon = {
    nama, kelas, nisn,
    spp, spp_paid_months: [], spp_history: {},
    pangkal, pangkal_paid: 0,
    uang_pendaftaran, uang_pendaftaran_paid: 0,
    status_kelulusan: 'calon',
    // SPP baru berlaku sejak bulan santri ini dimasukkan ke aplikasi — bulan
    // sebelumnya tidak boleh ikut terhitung sebagai tunggakan.
    spp_mulai: buildSppMulai(getProfil().ta || '', bulanBerjalanCode()),
  };

  appState.students.push(newCalon);
  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  saveSiswa(newCalon);
  // Simpan pangkal sebagai tagihan (persisten & terbawa saat promosi nanti)
  if (pangkal > 0) { try { await upsertPangkalTagihan(newCalon, pangkal); } catch(e) { console.error('pangkal calon:', e); } }
  if (uang_pendaftaran > 0) { try { await upsertPendaftaranTagihan(newCalon, uang_pendaftaran); } catch(e) { console.error('pendaftaran calon:', e); } }
  document.getElementById('addCalonModal').classList.remove('open');
  renderSpmbPage();
  toast(`✅ ${nama} berhasil ditambahkan sebagai calon santri!`);
}

// ══════════════════════════════════════════
// EDIT CALON SANTRI
// ══════════════════════════════════════════
function openEditCalonModal(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('edit_calon_original_nama').value = s.nama;
  document.getElementById('edit_calon_nama').value = s.nama;
  document.getElementById('edit_calon_nisn').value = s.nisn || '';
  document.getElementById('edit_calon_kelas').value = s.kelas;
  document.getElementById('edit_calon_spp').value = s.spp || '';
  const pdNom = (typeof getPendaftaranNominal === 'function') ? getPendaftaranNominal(s.nama) : 0;
  document.getElementById('edit_calon_pendaftaran').value = (pdNom || s.uang_pendaftaran) || '';
  const pkNom = (typeof getPangkalNominal === 'function') ? getPangkalNominal(s.nama) : 0;
  document.getElementById('edit_calon_pangkal').value = (pkNom || s.pangkal) || '';
  document.getElementById('editCalonModal').classList.add('open');
}

async function saveEditCalonSantri() {
  const origNama = document.getElementById('edit_calon_original_nama').value;
  const newNama = (document.getElementById('edit_calon_nama').value || '').trim().toUpperCase();
  const kelas = document.getElementById('edit_calon_kelas').value;
  if (!newNama) { toast('⚠️ Nama wajib diisi!'); return; }
  if (!kelas)   { toast('⚠️ Kelas target wajib dipilih!'); return; }
  if (newNama !== origNama && appState.students.find(s => s.nama === newNama)) {
    toast('⚠️ Nama sudah ada!'); return;
  }

  const idx = appState.students.findIndex(s => s.nama === origNama);
  if (idx < 0) { toast('⚠️ Data tidak ditemukan!'); return; }

  const old = appState.students[idx];
  appState.students[idx] = {
    ...old,
    nama: newNama,
    kelas,
    nisn: (document.getElementById('edit_calon_nisn').value || '').trim(),
    spp: Number(document.getElementById('edit_calon_spp').value) || 0,
    uang_pendaftaran: Number(document.getElementById('edit_calon_pendaftaran').value) || 0,
    pangkal: Number(document.getElementById('edit_calon_pangkal').value) || 0,
  };

  const pangkal = Number(document.getElementById('edit_calon_pangkal').value) || 0;
  const pendaftaran = Number(document.getElementById('edit_calon_pendaftaran').value) || 0;
  if (newNama !== origNama) {
    appState.transactions.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
    appState.tagihan.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
  }

  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  const saved = appState.students.find(s => s.nama === newNama);
  if (newNama !== origNama) renameStudentInDB(origNama, saved);
  else saveSiswa(saved);
  // Simpan nominal pangkal per-calon ke tagihan
  try {
    await upsertPangkalTagihan(saved, pangkal);
    await upsertPendaftaranTagihan(saved, pendaftaran);
  } catch(e) { console.error('tagihan calon edit:', e); }
  document.getElementById('editCalonModal').classList.remove('open');
  renderSpmbPage();
  toast(`✅ Data ${newNama} berhasil diperbarui!`);
}

// ══════════════════════════════════════════
// HAPUS CALON SANTRI
// ══════════════════════════════════════════
function deleteCalonSantri(nama) {
  document.getElementById('deleteMsg').textContent =
    `Hapus calon santri "${nama}"? Seluruh data pembayaran calon ini juga akan dihapus.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => s.nama !== nama);
    appState.transactions = appState.transactions.filter(t => t.nama !== nama);
    spmbSelectedRows.delete(nama);
    document.getElementById('deleteModal').classList.remove('open');
    renderSpmbPage();
    toast(`🗑️ ${nama} berhasil dihapus`);
    await deleteStudentFromDB(nama);
    await deleteTransactionsByNama(nama);
  };
  document.getElementById('deleteModal').classList.add('open');
}

function deleteSelectedCalon() {
  if (!spmbSelectedRows.size) return;
  const names = [...spmbSelectedRows];
  document.getElementById('deleteMsg').textContent =
    `Hapus ${names.length} calon santri: ${names.slice(0,3).join(', ')}${names.length > 3 ? ' dan ' + (names.length - 3) + ' lainnya' : ''}? Data pembayaran mereka juga akan dihapus.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => !spmbSelectedRows.has(s.nama));
    appState.transactions = appState.transactions.filter(t => !spmbSelectedRows.has(t.nama));
    spmbSelectedRows.clear();
    document.getElementById('deleteModal').classList.remove('open');
    renderSpmbPage();
    toast(`🗑️ ${names.length} calon santri berhasil dihapus`);
    await Promise.all(names.flatMap(n => [deleteStudentFromDB(n), deleteTransactionsByNama(n)]));
  };
  document.getElementById('deleteModal').classList.add('open');
}

// ══════════════════════════════════════════
// PROMOSI CALON → SANTRI AKTIF
// ══════════════════════════════════════════
function confirmPromoteSingle(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('promosiCalonNama').textContent = nama;
  document.getElementById('promosiCalonKelas').textContent = s.kelas;
  document.getElementById('promosiCalonSppInput').value = s.spp || '';
  const hint = document.getElementById('promosiCalonSppHint');
  if (hint) hint.textContent = s.spp > 0 ? `Nominal dari pendaftaran: ${rp(s.spp)}` : 'Belum diisi saat pendaftaran';
  // Bulan mulai tagih SPP: bawaannya bulan berjalan (bulan santri ini
  // diaktifkan), atau penanda yang sudah tersimpan sejak ia didaftarkan.
  const mulaiSel = document.getElementById('promosiCalonMulaiInput');
  if (mulaiSel) mulaiSel.innerHTML = sppMulaiOptionsHtml(sppMulaiBulan(s) || bulanBerjalanCode());
  renderSppMulaiWarn('promosiCalonMulaiWarn');
  document.getElementById('promosiCalonBtn').onclick = () => _doPromoteSingle(nama);
  document.getElementById('promosiCalonModal').classList.add('open');
}

async function _doPromoteSingle(nama) {
  const idx = appState.students.findIndex(s => s.nama === nama);
  if (idx < 0) return;
  const spp = Number(document.getElementById('promosiCalonSppInput').value) || 0;
  const mulai = document.getElementById('promosiCalonMulaiInput')?.value || '';
  appState.students[idx].status_kelulusan = '';
  appState.students[idx].spp = spp;
  appState.students[idx].spp_paid_months = [];
  appState.students[idx].spp_angsur = {};
  appState.students[idx].spp_history = {};
  appState.students[idx].spp_mulai = buildSppMulai(getProfil().ta || '', mulai);
  spmbSelectedRows.delete(nama);
  document.getElementById('promosiCalonModal').classList.remove('open');
  await saveSiswa(appState.students[idx]);
  // Lengkapi tagihan item tetap lain (pangkal sudah ada dari data calon → terbawa)
  try { await createTagihanForStudent(appState.students[idx]); } catch(e) { console.error('tagihan promosi:', e); }
  renderSpmbPage();
  renderSiswaTable();
  renderDashboard();
  // Hanya janjikan "SPP dihitung mulai X" bila penandanya memang tersimpan;
  // kalau kolomnya belum ada, peringatan migrasi yang tampil (lihat saveSiswa).
  const mulaiInfo = sppMulaiKolomAda() ? sppMulaiLabel(appState.students[idx]) : '';
  toast(`🎓 ${nama} berhasil dipromosikan ke Kelas ${appState.students[idx].kelas}!`
    + (mulaiInfo ? ` SPP dihitung mulai ${mulaiInfo}.` : ''), 3500);
}

function promoteSelectedCalon() {
  if (!spmbSelectedRows.size) return;
  const names = [...spmbSelectedRows];
  document.getElementById('promosiMassalCount').textContent = names.length;
  document.getElementById('promosiMassalNames').textContent =
    names.slice(0, 5).join(', ') + (names.length > 5 ? ` dan ${names.length - 5} lainnya` : '');
  document.getElementById('promosiMassalSppInput').value = '';
  const mulaiSel = document.getElementById('promosiMassalMulaiInput');
  if (mulaiSel) mulaiSel.innerHTML = sppMulaiOptionsHtml(bulanBerjalanCode());
  renderSppMulaiWarn('promosiMassalMulaiWarn');
  document.getElementById('promosiMassalBtn').onclick = () => _doPromoteMassal(names);
  document.getElementById('promosiMassalModal').classList.add('open');
}

async function _doPromoteMassal(names) {
  const overrideSpp = document.getElementById('promosiMassalSppInput').value.trim();
  const globalSpp = overrideSpp !== '' ? Number(overrideSpp) : null;
  const mulai = buildSppMulai(getProfil().ta || '',
    document.getElementById('promosiMassalMulaiInput')?.value || '');
  const updated = [];
  names.forEach(nama => {
    const idx = appState.students.findIndex(s => s.nama === nama);
    if (idx < 0) return;
    appState.students[idx].status_kelulusan = '';
    // Pakai override jika diisi, jika tidak pakai SPP masing-masing calon
    if (globalSpp !== null) appState.students[idx].spp = globalSpp;
    appState.students[idx].spp_paid_months = [];
    appState.students[idx].spp_angsur = {};
    appState.students[idx].spp_history = {};
    appState.students[idx].spp_mulai = mulai;
    updated.push(appState.students[idx]);
    spmbSelectedRows.delete(nama);
  });
  document.getElementById('promosiMassalModal').classList.remove('open');
  clearSpmbSelection();
  await Promise.all(updated.map(s => saveSiswa(s)));
  // Lengkapi tagihan item tetap lain untuk tiap santri (pangkal sudah terbawa)
  await Promise.all(updated.map(s => createTagihanForStudent(s).catch(() => {})));
  renderSpmbPage();
  renderSiswaTable();
  renderDashboard();
  const mulaiInfo = (updated.length && sppMulaiKolomAda()) ? sppMulaiLabel(updated[0]) : '';
  toast(`🎓 ${updated.length} calon santri berhasil dipromosikan!`
    + (mulaiInfo ? ` SPP dihitung mulai ${mulaiInfo}.` : ''), 3500);
}

// ══════════════════════════════════════════
// IMPORT EXCEL CALON SANTRI
// ══════════════════════════════════════════
let spmbImportBuffer = [];

function openImportCalonModal() {
  spmbImportBuffer = [];
  const fileInput = document.getElementById('spmbImportFile');
  if (fileInput) fileInput.value = '';
  document.getElementById('spmbImportPreview').innerHTML = '';
  document.getElementById('spmbImportStep1').style.display = 'block';
  document.getElementById('spmbImportStep2').style.display = 'none';
  document.getElementById('importCalonModal').classList.add('open');
}

function handleSpmbImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => _parseSpmbCSV(e.target.result);
    reader.readAsText(file);
  } else {
    // Pustaka Excel ditarik saat dibutuhkan saja (lihat xlsxReady di config.js).
    xlsxReady(() => {
      if (typeof XLSX === 'undefined') {
        toast('⚠️ Library Excel gagal dimuat. Cek koneksi atau gunakan format CSV.');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          _parseSpmbRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
        } catch(err) { toast('⚠️ Gagal membaca file: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
}

function _parseSpmbCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase().replace(/"/g,''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/"/g,''));
    const obj = {};
    headers.forEach((h, idx) => obj[h] = cells[idx] || '');
    rows.push(obj);
  }
  _parseSpmbRows(rows);
}

function _parseSpmbRows(rows) {
  spmbImportBuffer = [];
  const findKey = (obj, keys) => {
    for (const k of keys) {
      for (const v of [k, k.toLowerCase(), k.toUpperCase()]) {
        if (obj[v] !== undefined && obj[v] !== '') return obj[v];
      }
    }
    return '';
  };
  const normalizeKelas = k => {
    k = String(k).trim();
    if (/VIII/i.test(k)) return '8';
    if (/IX/i.test(k))   return '9';
    if (/VII/i.test(k))  return '7';
    return k;
  };

  rows.forEach(row => {
    const nama = String(findKey(row, ['NAMA','NAME','NAMA LENGKAP']) || '').trim().toUpperCase();
    if (!nama || nama === 'NO' || nama === 'NAMA LENGKAP') return;
    const kelas = normalizeKelas(findKey(row, ['KELAS','CLASS','GRADE']));
    if (!['7','8','9'].includes(kelas)) return;
    const nisn = String(findKey(row, ['NISN']) || '').trim().replace(/'/g,'');
    const spp = Number(String(findKey(row, ['SPP','SPP_BULANAN','SPP BULANAN']) || '0').replace(/[^0-9]/g,'')) || 0;
    const uang_pendaftaran = Number(String(findKey(row, ['UANG_PENDAFTARAN','PENDAFTARAN','UANG PENDAFTARAN']) || '0').replace(/[^0-9]/g,'')) || 0;
    const pangkal = Number(String(findKey(row, ['PANGKAL','UANG_PANGKAL','UANG PANGKAL']) || '0').replace(/[^0-9]/g,'')) || 0;
    spmbImportBuffer.push({ nama, kelas, nisn, spp, uang_pendaftaran, pangkal });
  });

  if (!spmbImportBuffer.length) { toast('⚠️ Tidak ada data valid di file'); return; }

  document.getElementById('spmbImportPreview').innerHTML = `
    <div class="fs-13 fw-600 text-primary mb-10">
      <svg class="ic"><use href="#i-check"/></svg> ${spmbImportBuffer.length} calon santri siap diimport:
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>NISN</th><th>SPP/bln</th><th>Uang Pendaftaran</th><th>Pangkal</th></tr></thead>
        <tbody>
          ${spmbImportBuffer.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${esc(s.nama)}</strong></td>
              <td>${esc(s.kelas)}</td>
              <td>${esc(s.nisn || '—')}</td>
              <td>${s.spp ? rp(s.spp) : '—'}</td>
              <td>${s.uang_pendaftaran ? rp(s.uang_pendaftaran) : '—'}</td>
              <td>${s.pangkal ? rp(s.pangkal) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('spmbImportStep1').style.display = 'none';
  document.getElementById('spmbImportStep2').style.display = 'block';
}

async function confirmSpmbImport() {
  let ditambah = 0, dilewati = 0;
  const added = [];
  spmbImportBuffer.forEach(row => {
    if (appState.students.find(s => s.nama === row.nama)) { dilewati++; return; }
    const calon = {
      nama: row.nama, kelas: row.kelas, nisn: row.nisn,
      spp: row.spp || 0, spp_paid_months: [], spp_history: {},
      pangkal: row.pangkal, pangkal_paid: 0,
      uang_pendaftaran: row.uang_pendaftaran, uang_pendaftaran_paid: 0,
      status_kelulusan: 'calon',
      // Sama seperti input manual: SPP berlaku sejak bulan import dilakukan.
      spp_mulai: buildSppMulai(getProfil().ta || '', bulanBerjalanCode()),
    };
    appState.students.push(calon);
    added.push(calon);
    ditambah++;
  });
  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById('importCalonModal').classList.remove('open');
  spmbImportBuffer = [];
  // Simpan hanya calon yang baru ditambahkan — mengirim seluruh tabel berisiko
  // menimpa perubahan santri lain yang dibuat dari device lain.
  pauseAutoSync();
  try {
    for (let i = 0; i < added.length; i += 50) await saveStudentsBatch(added.slice(i, i + 50));
  } catch (e) {
    console.error('importCalon save:', e);
    toast('⚠️ Import calon gagal tersimpan — cek koneksi lalu ulangi');
    resumeAutoSync();
    return;
  }
  resumeAutoSync();
  // Buat tagihan pangkal untuk calon yang punya nominal (persisten & terbawa)
  await Promise.all(added.filter(c => (c.pangkal || 0) > 0).map(c => upsertPangkalTagihan(c, c.pangkal).catch(() => {})));
  await Promise.all(added.filter(c => (c.uang_pendaftaran || 0) > 0).map(c => upsertPendaftaranTagihan(c, c.uang_pendaftaran).catch(() => {})));
  renderSpmbPage();
  toast(`✅ Import: ${ditambah} ditambahkan${dilewati ? ', ' + dilewati + ' dilewati (nama duplikat)' : ''}`);
}

function downloadTemplateCalonExcel() { xlsxReady(_downloadTemplateCalonExcel); }
function _downloadTemplateCalonExcel() {
  if (typeof XLSX !== 'undefined') {
    const headers = ['NAMA', 'KELAS', 'NISN', 'SPP', 'UANG_PENDAFTARAN', 'PANGKAL'];
    const ex1 = ['AHMAD FAUZI', '7', '1234567890', 500000, 400000, 3000000];
    const ex2 = ['SITI AMINAH', '7', '', 500000, 400000, 3000000];
    const ex3 = ['BUDI SANTOSO', '8', '', 600000, 400000, 0];
    const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3]);
    ws['!cols'] = [{wch:30},{wch:8},{wch:14},{wch:12},{wch:18},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calon Santri SPMB');
    XLSX.writeFile(wb, 'template_import_calon_spmb.xlsx');
    toast('📋 Template Excel berhasil didownload');
  } else {
    const csv = `NAMA,KELAS,NISN,SPP,UANG_PENDAFTARAN,PANGKAL\nAHMAD FAUZI,7,1234567890,500000,400000,3000000\nSITI AMINAH,7,,500000,400000,3000000\n`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'template_import_calon_spmb.csv';
    a.click();
    toast('📋 Template CSV berhasil didownload');
  }
}

// ── Init modal click-outside + drag-drop zone ──
document.addEventListener('DOMContentLoaded', () => {
  ['addCalonModal','editCalonModal','importCalonModal','promosiCalonModal','promosiMassalModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
  });

  const spmbZone = document.getElementById('spmbImportZone');
  if (spmbZone) {
    spmbZone.addEventListener('click', () => document.getElementById('spmbImportFile')?.click());
    spmbZone.addEventListener('dragover', e => { e.preventDefault(); spmbZone.style.borderColor = 'var(--primary-light)'; spmbZone.style.background = 'var(--primary-pale)'; });
    spmbZone.addEventListener('dragleave', () => { spmbZone.style.borderColor = ''; spmbZone.style.background = ''; });
    spmbZone.addEventListener('drop', e => {
      e.preventDefault(); spmbZone.style.borderColor = ''; spmbZone.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file) handleSpmbImportFile({ files: [file] });
    });
  }
});
;// ══ js/audit.js ══
// ── SiPay · Periksa & Pulihkan Data ──
// ══════════════════════════════════════════
// Alat rekonsiliasi untuk memulihkan pembayaran yang HILANG karena bug
// tulis-timpa lintas device (sebelum perbaikan sinkronisasi).
//
// KENAPA BISA DIPULIHKAN:
//   Tabel `kuitansi` bersifat TAMBAH-SAJA — tiap pembayaran menulis satu baris
//   kuitansi dan baris itu tidak pernah ditimpa oleh device lain. Yang dulu
//   tertimpa hanyalah data TURUNAN-nya: `students.spp_paid_months`,
//   `students.spp_history`, dan `tagihan.paid_amount`.
//
//   Jadi kuitansi adalah buku besar (ledger) yang bisa dibaca ulang untuk
//   mencari pembayaran yang kuitansinya ada tapi tidak tercatat lunas.
//
// PRINSIP KEAMANAN — HANYA MENAMBAH, TIDAK PERNAH MENGURANGI:
//   Bug-nya menyebabkan data HILANG, bukan data palsu. Jadi pemulihan hanya
//   boleh menandai yang belum tertandai. Bulan yang sudah lunas tidak akan
//   dibatalkan, nominal terbayar tidak akan diturunkan. Dengan begitu alat ini
//   tidak bisa merusak data yang sudah benar.
//
// YANG TIDAK BISA DIPULIHKAN (tidak ada jejaknya di buku besar):
//   • Perubahan identitas santri (nama/kelas/NISN/nominal SPP) yang tertimpa.
//   • Nominal tagihan (`tagihan.nominal`) yang tertimpa.
//   • Profil madrasah yang sempat terkosongkan.
//   • Isian yang belum sempat disimpan sama sekali (browser ditutup di tengah).
// ══════════════════════════════════════════

const AUDIT_BI_PREFIX = 'BI-';   // kuitansi Buku Induk = arsip, jangan diputar ulang

let auditResult = null;   // hasil pemeriksaan terakhir

// TA tujuan bulan SPP pada satu baris kuitansi — beserta seberapa yakin.
//
// Ada dua sumber informasi, dan keandalannya JAUH berbeda:
//
//   'nama'  — nama item bertuliskan "SPP Tunggakan TA 2024/2025". Ini ditulis
//             oleh alur pembayaran tunggakan, jadi TA-nya PASTI.
//
//   'label' — kolom `ta_label` kuitansi. Ini hanya merekam isi Profil Madrasah
//             → Tahun Ajaran PADA SAAT pembayaran disimpan, BUKAN tahun ajaran
//             yang dibayar. Contoh nyata: calon santri kelas 7 TA 2026/2027
//             membayar SPP Juli–Oktober lebih awal, saat profil masih tertulis
//             2025/2026 → kuitansinya ber-ta_label 2025/2026 padahal bulan yang
//             dibayar milik 2026/2027. Jadi label hanya boleh dipakai sebagai
//             DUGAAN, tidak pernah sebagai dasar menyimpulkan data hilang.
function _auditTargetTA(kwt, item, currentTA) {
  const m = String(item.name || '').match(/Tunggakan\s+TA\s+([0-9]{4}\s*\/\s*[0-9]{4})/i);
  if (m) return { ta: m[1].replace(/\s+/g, ''), sumber: 'nama' };
  const label = String(kwt.ta_label || '').trim();
  if (label && label !== currentTA) return { ta: label, sumber: 'label' };
  return { ta: null, sumber: 'berjalan' };
}

// Baca buku besar kuitansi & hitung kondisi yang SEHARUSNYA tercatat.
async function auditLedger() {
  const currentTA = (getProfil().ta || '').trim();

  showSyncIndicator('🔍 Membaca buku besar kuitansi...');
  const kwts = await sbAll('kuitansi?select=*&order=created_at.asc,id.asc');

  const byNo = {};
  kwts.forEach(k => { if (k.no_kuitansi) byNo[k.no_kuitansi] = k; });

  // nama → { spp:Set, histPasti:{ta:Set}, histDuga:{ta:Set}, tagihan:{id:nominal} }
  //   spp       : bulan SPP tahun ajaran berjalan
  //   histPasti : TA dari nama item ("SPP Tunggakan TA …") — dasarnya kuat
  //   histDuga  : TA dari ta_label saja — hanya dugaan, lihat _auditTargetTA()
  const exp = {};
  const slot = nama => (exp[nama] || (exp[nama] = {
    spp: new Set(), histPasti: {}, histDuga: {}, tagihan: {},
  }));
  const taSet = (nama, bucket, ta) => {
    const b = slot(nama)[bucket];
    return b[ta] || (b[ta] = new Set());
  };

  const addBulan = (kwt, item, sign) => {
    // Angsuran (bayar sebagian) tidak berarti bulannya lunas — dilewati.
    if (!item.bulan || item.angsur) return;
    const { ta, sumber } = _auditTargetTA(kwt, item, currentTA);
    const set = !ta ? slot(kwt.nama).spp
              : taSet(kwt.nama, sumber === 'nama' ? 'histPasti' : 'histDuga', ta);
    if (sign > 0) set.add(item.bulan); else set.delete(item.bulan);
  };
  const addTagihan = (nama, itemId, amount) => {
    if (!itemId || itemId === 'spp') return;
    const t = slot(nama).tagihan;
    t[itemId] = (t[itemId] || 0) + amount;
  };

  let dilewatiBI = 0;
  kwts.forEach(kwt => {
    if (String(kwt.no_kuitansi || '').toUpperCase().startsWith(AUDIT_BI_PREFIX)) { dilewatiBI++; return; }
    if (!kwt.nama || !Array.isArray(kwt.items)) return;

    kwt.items.forEach(item => {
      const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
      const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';

      if (kwt.is_koreksi) {
        if (dibatalkan) {
          // item.amount pada kuitansi koreksi "batalkan" = nominal asli
          addBulan(kwt, item, -1);
          addTagihan(kwt.nama, item.item_id, -(Number(item.amount) || 0));
        } else if (dikoreksi) {
          // item.amount = nilai BARU; selisihnya perlu nominal asli dari
          // kuitansi yang dikoreksi.
          const ref = byNo[kwt.ref_no_kuitansi];
          const asal = ref && Array.isArray(ref.items)
            ? ref.items.find(x => x.item_id === item.item_id && (x.bulan || null) === (item.bulan || null))
            : null;
          if (asal) {
            addTagihan(kwt.nama, item.item_id, (Number(item.amount) || 0) - (Number(asal.amount) || 0));
          }
        }
      } else {
        addBulan(kwt, item, +1);
        addTagihan(kwt.nama, item.item_id, Number(item.amount) || 0);
      }
    });
  });

  // ── Bandingkan dengan kondisi tercatat sekarang ──
  showSyncIndicator('🔍 Membandingkan dengan data tercatat...');
  const students = await loadStudents();
  const tagihan  = await loadTagihan();
  const byNama   = {};
  students.forEach(s => { byNama[s.nama] = s; });

  const temuanSpp = [];      // { nama, bulan: [], ta: null|'2024/2025' }
  const temuanTagihan = [];  // { nama, item_id, item_name, tercatat, seharusnya, selisih, id }
  const tanpaSantri = [];    // kuitansi atas nama yang tidak ada di tabel santri
  const histTanpaRecord = [];// bulan TA lama yang belum punya entri spp_history

  Object.entries(exp).forEach(([nama, e]) => {
    const s = byNama[nama];
    if (!s) { tanpaSantri.push(nama); return; }

    const hist = (s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
    const bulanBerjalan = new Set(s.spp_paid_months || []);
    const bulanHist = ta => new Set(((hist[ta] || {}).spp_paid_months) || []);

    // ── SPP tahun ajaran berjalan ──
    // Sudah tercatat di riwayat TA mana pun juga dianggap beres: bisa jadi
    // bulan itu memang milik tahun lalu dan sudah diarsipkan promosi kelas.
    const adaDiRiwayatManapun = b => Object.values(hist)
      .some(rec => (rec && rec.spp_paid_months || []).includes(b));
    const kurang = [...e.spp].filter(b => !bulanBerjalan.has(b) && !adaDiRiwayatManapun(b));
    if (kurang.length) temuanSpp.push({ nama, ta: null, bulan: kurang });

    // ── Tunggakan TA lama, TA-nya PASTI (dari nama item) ──
    Object.entries(e.histPasti).forEach(([ta, set]) => {
      const sudahH = bulanHist(ta);
      const kurangH = [...set].filter(b => !sudahH.has(b));
      if (!kurangH.length) return;
      if (!hist[ta]) {
        // Belum ada entri TA itu — memulihkannya berarti menebak nominal SPP
        // tahun tersebut. Dilaporkan saja, tidak diperbaiki otomatis.
        histTanpaRecord.push({ nama, ta, bulan: kurangH, sebab: 'tanpa-entri' });
        return;
      }
      temuanSpp.push({ nama, ta, bulan: kurangH });
    });

    // ── TA dari ta_label saja: hanya DUGAAN ──
    // ta_label merekam isi profil saat pembayaran disimpan, bukan tahun ajaran
    // yang dibayar. Karena itu bulan yang sudah tercatat lunas DI MANA PUN
    // (tahun berjalan maupun riwayat TA mana saja) dianggap beres — jangan
    // sampai santri baru yang membayar di muka dilaporkan sebagai data hilang.
    Object.entries(e.histDuga).forEach(([ta, set]) => {
      const sudahH = bulanHist(ta);
      const kurangH = [...set].filter(b =>
        !sudahH.has(b) && !bulanBerjalan.has(b) && !adaDiRiwayatManapun(b));
      if (!kurangH.length) return;
      if (!hist[ta]) {
        histTanpaRecord.push({ nama, ta, bulan: kurangH, sebab: 'tanpa-entri' });
        return;
      }
      temuanSpp.push({ nama, ta, bulan: kurangH });
    });

    Object.entries(e.tagihan).forEach(([itemId, seharusnya]) => {
      const t = tagihan.find(x => x.nama === nama && x.item_id === itemId);
      if (!t) return;   // tidak ada baris tagihan — di luar jangkauan alat ini
      const selisih = Math.round(seharusnya - (t.paid_amount || 0));
      if (selisih > 0) {
        temuanTagihan.push({
          nama, item_id: itemId, item_name: t.item_name, id: t.id,
          tercatat: t.paid_amount || 0, seharusnya: Math.round(seharusnya), selisih,
        });
      }
    });
  });

  showSyncIndicator('✅ Pemeriksaan selesai', 2000);
  auditResult = {
    diperiksa: kwts.length, dilewatiBI,
    temuanSpp, temuanTagihan, tanpaSantri, histTanpaRecord,
    waktu: new Date(),
  };
  return auditResult;
}

// ══ UI ══
function openAuditModal() {
  document.getElementById('auditModal').classList.add('open');
  document.getElementById('auditBody').innerHTML =
    '<div class="p-24 text-center text-muted fs-13">'
    + 'Klik <strong>Mulai Periksa</strong> untuk membaca ulang seluruh kuitansi dan '
    + 'membandingkannya dengan data yang tercatat.<br><br>'
    + 'Pemeriksaan ini <strong>hanya membaca</strong> — tidak mengubah apa pun.</div>';
  document.getElementById('auditApplyBtn').style.display = 'none';
}
function closeAuditModal() {
  document.getElementById('auditModal').classList.remove('open');
}

async function runAudit() {
  const btn = document.getElementById('auditRunBtn');
  if (btn) { btn.disabled = true; setIconText(btn, '⏳ Memeriksa...'); }
  document.getElementById('auditBody').innerHTML =
    '<div class="p-24 text-center text-muted fs-13"><svg class="ic"><use href="#i-clock"/></svg> Membaca buku besar kuitansi...</div>';
  pauseAutoSync();
  try {
    const r = await auditLedger();
    renderAuditResult(r);
  } catch(e) {
    console.error('runAudit:', e);
    document.getElementById('auditBody').innerHTML =
      `<div class="warn-box"><svg class="ic"><use href="#i-alert"/></svg> Gagal memeriksa: ${esc(e.message)}</div>`;
  } finally {
    resumeAutoSync();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#i-search"/></svg> Periksa Ulang'; }
  }
}

function renderAuditResult(r) {
  const totalBulan = r.temuanSpp.reduce((a, t) => a + t.bulan.length, 0);
  const totalRupiah = r.temuanTagihan.reduce((a, t) => a + t.selisih, 0);
  const bersih = !totalBulan && !r.temuanTagihan.length && !r.tanpaSantri.length && !r.histTanpaRecord.length;

  let html = `<div class="info-box mb-14">
    Diperiksa <strong>${r.diperiksa}</strong> kuitansi
    ${r.dilewatiBI ? `(<strong>${r.dilewatiBI}</strong> kuitansi Buku Induk dilewati — murni arsip)` : ''}.
  </div>`;

  if (bersih) {
    html += `<div class="info-box info-box-ok">
      <svg class="ic"><use href="#i-check"/></svg> <strong>Tidak ada pembayaran yang hilang.</strong> Semua kuitansi cocok dengan data yang tercatat.
    </div>`;
    document.getElementById('auditBody').innerHTML = html;
    document.getElementById('auditApplyBtn').style.display = 'none';
    return;
  }

  if (totalBulan) {
    html += `<div class="group-title">
      <svg class="ic"><use href="#i-cal"/></svg> Bulan SPP berkuitansi tapi belum tercatat lunas — <span class="text-danger">${totalBulan} bulan</span>
    </div>
    <div class="scroll-box-200">
    <table class="table-compact">
      <thead><tr class="bg-bg sticky top-0">
        <th class="text-left p-6-10">Santri</th>
        <th class="text-left p-6-10">Tahun Ajaran</th>
        <th class="text-left p-6-10">Bulan</th>
      </tr></thead><tbody>`;
    r.temuanSpp.forEach(t => {
      html += `<tr class="border-t-1-border">
        <td class="p-6-10">${esc(t.nama)}</td>
        <td class="p-6-10">${t.ta ? esc(t.ta) : 'Berjalan'}</td>
        <td class="p-6-10">${esc(t.bulan.map(b => MONTH_FULL[b] || b).join(', '))}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (r.temuanTagihan.length) {
    html += `<div class="group-title">
      <svg class="ic"><use href="#i-card"/></svg> Tagihan item: kuitansi mencatat lebih besar dari yang tersimpan — <span class="text-danger">${rp(totalRupiah)}</span>
    </div>
    <div class="warn-box mb-8">
      <svg class="ic"><use href="#i-alert"/></svg> Periksa bagian ini dulu sebelum diterapkan. Bila Anda pernah memakai
      <strong>Import Tunggakan</strong>, nominal terbayar sebagian santri disetel
      langsung dari file (bukan dari kuitansi), sehingga selisih di sini bisa saja
      <em>bukan</em> data hilang. Centang penerapannya hanya jika angkanya masuk akal.
    </div>
    <div class="scroll-box-200">
    <table class="table-compact">
      <thead><tr class="bg-bg sticky top-0">
        <th class="text-left p-6-10">Santri</th>
        <th class="text-left p-6-10">Item</th>
        <th class="text-right p-6-10">Tercatat</th>
        <th class="text-right p-6-10">Menurut kuitansi</th>
        <th class="text-right p-6-10">Selisih</th>
      </tr></thead><tbody>`;
    r.temuanTagihan.forEach(t => {
      html += `<tr class="border-t-1-border">
        <td class="p-6-10">${esc(t.nama)}</td>
        <td class="p-6-10">${esc(t.item_name)}</td>
        <td class="p-6-10 text-right">${rp(t.tercatat)}</td>
        <td class="p-6-10 text-right">${rp(t.seharusnya)}</td>
        <td class="p-6-10 text-right text-danger fw-600">+${rp(t.selisih)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (r.histTanpaRecord.length) {
    html += `<div class="group-title"><svg class="ic"><use href="#i-pin"/></svg> Perlu diperiksa sendiri</div>
    <div class="warn-box">
    Ada ${r.histTanpaRecord.length} bulan SPP berkuitansi yang <strong>tidak bisa dipastikan</strong>
    milik tahun ajaran mana, dan santrinya belum punya entri riwayat SPP untuk tahun tersebut.
    <strong>Tidak diperbaiki otomatis</strong> — silakan dicocokkan sendiri:<br><br>
    ${r.histTanpaRecord.slice(0, 12).map(h => `• ${esc(h.nama)} — TA ${esc(h.ta)} (${esc(h.bulan.map(b => MONTH_FULL[b] || b).join(', '))})`).join('<br>')}
    ${r.histTanpaRecord.length > 12 ? `<br>• …dan ${r.histTanpaRecord.length - 12} lainnya` : ''}
    <br><br>
    <strong>Sering kali ini bukan masalah.</strong> Tahun ajaran di sini ditebak dari kolom
    <code>ta_label</code> kuitansi, yang hanya merekam isi <em>Profil Madrasah → Tahun Ajaran</em>
    pada saat pembayaran disimpan — bukan tahun ajaran yang dibayar. Jadi kalau santri baru
    membayar SPP di muka sebelum profil diganti ke tahun ajaran berikutnya, namanya akan muncul
    di sini padahal pembayarannya sudah tercatat benar. Cek saja santrinya di
    <em>Input Pembayaran</em>: bila bulan-bulan itu sudah tercentang lunas, abaikan baris ini.
    </div>`;
  }

  if (r.tanpaSantri.length) {
    html += `<div class="warn-box mt-12">
      ${r.tanpaSantri.length} kuitansi atas nama yang tidak ada lagi di data santri
      (kemungkinan santri sudah dihapus atau namanya diubah):
      ${esc(r.tanpaSantri.slice(0, 8).join(', '))}${r.tanpaSantri.length > 8 ? ', …' : ''}
    </div>`;
  }

  html += `<div class="mt-16 border-t-1-border pt-12">
    <div class="fw-700 fs-13 mb-8">Pilih yang akan dipulihkan:</div>
    <label class="flex items-center gap-8 fs-13 pointer mb-6">
      <input class="accent-primary" type="checkbox" id="auditFixSpp" ${totalBulan ? 'checked' : 'disabled'}>
      Tandai lunas ${totalBulan} bulan SPP di atas
    </label>
    <label class="flex items-center gap-8 fs-13 pointer">
      <input class="accent-primary" type="checkbox" id="auditFixTagihan" ${r.temuanTagihan.length ? '' : 'disabled'}>
      Tambahkan ${rp(totalRupiah)} ke nominal terbayar tagihan item <span class="text-muted">(baca peringatan di atas)</span>
    </label>
    <div class="fs-12 text-muted mt-10">
      Pemulihan hanya <strong>menambah</strong>: tidak ada bulan yang dibatalkan dan
      tidak ada nominal yang diturunkan.
    </div>
  </div>`;

  document.getElementById('auditBody').innerHTML = html;
  const applyBtn = document.getElementById('auditApplyBtn');
  applyBtn.hidden = false; applyBtn.style.display = '';
  applyBtn.disabled = false;
  applyBtn.innerHTML = '<svg class="ic"><use href="#i-save"/></svg> Terapkan Pemulihan';
}

async function applyAuditFix() {
  if (!auditResult) return;
  const fixSpp     = !!document.getElementById('auditFixSpp')?.checked;
  const fixTagihan = !!document.getElementById('auditFixTagihan')?.checked;
  if (!fixSpp && !fixTagihan) { toast('⚠️ Pilih dulu yang mau dipulihkan'); return; }

  const btn = document.getElementById('auditApplyBtn');
  btn.disabled = true; setIconText(btn, '⏳ Memulihkan...');
  pauseAutoSync();

  let okSpp = 0, okTagihan = 0, gagal = 0;
  try {
    if (fixSpp) {
      // Gabungkan per santri supaya satu santri cukup satu kali tulis.
      const perSantri = {};
      auditResult.temuanSpp.forEach(t => {
        const p = perSantri[t.nama] || (perSantri[t.nama] = { months: [], hist: {} });
        if (t.ta) {
          const rec = p.hist[t.ta] || (p.hist[t.ta] = { months: [] });
          rec.months.push(...t.bulan);
        } else {
          p.months.push(...t.bulan);
        }
      });
      const namaList = Object.keys(perSantri);
      for (let i = 0; i < namaList.length; i++) {
        const nama = namaList[i];
        const p = perSantri[nama];
        showSyncIndicator(`⏳ Memulihkan SPP ${i + 1}/${namaList.length}...`);
        try {
          // rate diambil dari entri riwayat yang sudah ada (temuan tanpa entri
          // sudah disaring keluar saat pemeriksaan), jadi tidak menebak nominal.
          const s = appState.students.find(x => x.nama === nama);
          const hist = [];
          Object.entries(p.hist).forEach(([ta, rec]) => {
            const existing = s && s.spp_history && s.spp_history[ta];
            const rate = existing ? (existing.spp || 0) : 0;
            rec.months.forEach(m => hist.push({ ta, m, delta: Infinity, rate }));   // Infinity = lunasi
          });
          await commitSppOps(nama, { cur: p.months.map(m => ({ m, add: true })), hist });
          okSpp++;
        } catch(e) { console.error('applyAuditFix spp', nama, e); gagal++; }
      }
    }

    if (fixTagihan) {
      for (let i = 0; i < auditResult.temuanTagihan.length; i++) {
        const t = auditResult.temuanTagihan[i];
        showSyncIndicator(`⏳ Memulihkan tagihan ${i + 1}/${auditResult.temuanTagihan.length}...`);
        try { await addTagihanPaid(t.id, t.selisih); okTagihan++; }
        catch(e) { console.error('applyAuditFix tagihan', t, e); gagal++; }
      }
    }
  } finally {
    resumeAutoSync();
  }

  showSyncIndicator('✅ Pemulihan selesai', 2500);
  toast(`✅ Dipulihkan: ${okSpp} santri (SPP), ${okTagihan} tagihan${gagal ? ` — ${gagal} gagal, coba lagi` : ''}`);

  await syncNow(true);
  closeAuditModal();
}
;// ══ js/realtime.js ══
// ── SiPay · Realtime (Supabase WebSocket) ──
// ══════════════════════════════════════════
// Menyambung ke Supabase Realtime supaya perubahan dari device lain masuk
// SEKETIKA (biasanya < 1 detik), bukan menunggu polling berkala.
//
// Cara kerja: satu channel WebSocket mendengarkan perubahan (INSERT/UPDATE/
// DELETE) pada tabel students, tagihan, transactions, kuitansi, dan settings.
// Event-nya SUDAH memuat baris yang berubah, jadi baris itu langsung dipasang
// ke appState tanpa menarik apa pun dari server (lihat _rtTerapkan di bawah).
// Bila satu perubahan tidak bisa dipastikan, barulah seluruh data ditarik ulang
// seperti dulu — di-debounce 400 ms supaya satu pembayaran yang menulis ke
// beberapa tabel hanya memicu satu tarikan.
//
// PENTING — dua syarat di sisi server:
//   1. Tabel harus masuk publication `supabase_realtime`.
//      Jalankan `supabase_migration_realtime.sql` sekali di SQL Editor.
//   2. RLS: kebijakan tabel adalah admin-only (`TO authenticated`), jadi
//      koneksi Realtime WAJIB memakai access_token admin — bukan anon key.
//      Tanpa token yang sah, event tidak akan terkirim sama sekali.
//
// Bila Realtime tidak tersedia (CDN diblokir, WebSocket ditutup jaringan
// sekolah, atau migrasi publication belum dijalankan), aplikasi TIDAK rusak:
// js/sync.js otomatis kembali ke polling 20 detik seperti biasa.
// ══════════════════════════════════════════

const RT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const RT_TABLES     = ['students', 'tagihan', 'transactions', 'kuitansi', 'settings'];
const RT_DEBOUNCE_MS = 400;    // gabungkan letupan event jadi satu tarikan data
const RT_RETRY_MS    = 15000;  // jeda coba-sambung-ulang saat channel gagal

let _rtClient   = null;
let _rtChannel  = null;
let _rtActive   = false;   // true = channel SUBSCRIBED & event mengalir
let _rtLoading  = null;    // promise pemuatan script CDN
let _rtDebounce = null;
let _rtRetry    = null;
let _rtWanted   = false;   // apakah realtime memang diminta menyala

function isRealtimeActive() { return _rtActive; }

// Muat pustaka Supabase dari CDN sekali saja.
function loadRealtimeLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
  if (_rtLoading) return _rtLoading;
  _rtLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = RT_SCRIPT_URL;
    s.async = true;
    s.onload  = () => resolve(!!(window.supabase && window.supabase.createClient));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _rtLoading;
}

function _setRealtimeStatus(active) {
  if (_rtActive === active) return;
  _rtActive = active;
  const gl = document.getElementById('gasLabel');
  if (gl && gl.textContent !== 'Offline') {
    gl.textContent = active ? 'Realtime' : 'Terhubung';
  }
  const btn = document.getElementById('syncNowBtn');
  if (btn) {
    btn.title = active
      ? 'Realtime aktif — perubahan dari device lain masuk seketika. Klik untuk tarik ulang manual.'
      : 'Ambil data terbaru dari server (semua device dibuat sama)';
  }
  // Polling jadi jaring pengaman yang lebih longgar saat realtime hidup.
  if (typeof rescheduleAutoSync === 'function') rescheduleAutoSync();
}

// ══════════════════════════════════════════
// TERAPKAN PERUBAHAN LANGSUNG KE appState
// ══════════════════════════════════════════
// Event postgres_changes sudah MEMBAWA baris yang berubah (payload.new), jadi
// menariknya lagi dari server itu mubazir. Dulu setiap event memanggil syncNow()
// — satu pembayaran menulis ke tagihan + transactions + kuitansi, jadi tiga
// event, dan hasilnya seluruh data santri + tagihan + transaksi diunduh ulang.
// Di SEMUA device, termasuk device yang baru saja menginputnya sendiri.
//
// Sekarang baris dari payload langsung dipasang ke appState, lalu halaman yang
// sedang dibuka digambar ulang. Tidak ada unduhan sama sekali.
//
// Jalur lama tetap ada sebagai jaring pengaman dan dipakai kapan pun perubahan
// TIDAK bisa dipastikan (lihat daftar di _rtTerapkan). Polling berkala tiap 2
// menit juga tetap jalan sebagai pengoreksi bila ada event yang terlewat —
// itulah sebabnya penyimpangan tidak bisa menumpuk.

const RT_RENDER_DEBOUNCE_MS = 150;   // gabungkan letupan event jadi satu gambar ulang
const RT_RENDER_RETRY_MS    = 2000;  // coba lagi bila belum boleh menggambar

let _rtRenderTimer = null;

function _rtJadwalkanRender() {
  clearTimeout(_rtRenderTimer);
  _rtRenderTimer = setTimeout(_rtRender, RT_RENDER_DEBOUNCE_MS);
}

function _rtRender() {
  _rtRenderTimer = null;
  // Menggambar ulang di balik modal yang terbuka bisa membatalkan pekerjaan
  // yang sedang berjalan (renderSiswaTable memanggil clearSelection, sehingga
  // centang baris untuk hapus massal ikut hilang). Datanya SUDAH masuk ke
  // appState; yang ditunda hanya tampilannya.
  if (document.hidden || document.querySelector('.modal-overlay.open')) {
    _rtRenderTimer = setTimeout(_rtRender, RT_RENDER_RETRY_MS);
    return;
  }
  try {
    if (typeof renderHalamanAktif === 'function') renderHalamanAktif();
    if (typeof refreshInputPageIfIdle === 'function') refreshInputPageIfIdle();
  } catch(e) { console.warn('realtime render:', e.message); }
}

// Sisipkan santri baru pada posisi terurut nama, tanpa mengurutkan ulang daftar
// yang sudah ada (urutan dari server memakai kolasi Postgres — mengurutkan ulang
// di sisi klien bisa mengacak baris yang sudah tampil).
function _rtSisipkanSantri(row) {
  const list = appState.students;
  let i = list.findIndex(s => String(s.nama).localeCompare(String(row.nama), 'id') > 0);
  if (i < 0) i = list.length;
  list.splice(i, 0, row);
}

function _rtStudents(evt, baru, lama) {
  const list = appState.students;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(s => s.id === id);
    if (i < 0) return false;   // tak dikenal → tarik ulang, jangan menebak
    list.splice(i, 1);
    return true;
  }
  if (!baru || !baru.nama) return false;
  // Cocokkan lewat id lebih dulu supaya penggantian nama (rename) memperbarui
  // baris yang sama, bukan menambah baris kedua. Santri yang baru dibuat di
  // device ini belum punya id — server membalasnya dengan return=minimal —
  // jadi nama dipakai sebagai cadangan; id-nya terisi dari event ini.
  let i = baru.id ? list.findIndex(s => s.id === baru.id) : -1;
  if (i < 0) i = list.findIndex(s => s.nama === baru.nama);
  // Baris lama ikut diserahkan ke mapStudentRow: kolom opsional yang tidak
  // dibawa payload event (mis. spp_mulai bila migrasinya belum jalan) harus
  // dipertahankan, bukan dikosongkan.
  const row = mapStudentRow(baru, i >= 0 ? list[i] : null);
  if (i < 0) { _rtSisipkanSantri(row); return true; }
  if (list[i].nama !== row.nama) { list.splice(i, 1); _rtSisipkanSantri(row); }
  else list[i] = row;
  return true;
}

function _rtTagihan(evt, baru, lama) {
  const list = appState.tagihan;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(t => t.id === id);
    if (i >= 0) list.splice(i, 1);
    return true;   // sudah tidak ada = hasil akhirnya sama
  }
  if (!baru || !baru.id) return false;
  const row = mapTagihanRow(baru);
  const i = list.findIndex(t => t.id === row.id);
  if (i < 0) list.push(row); else list[i] = row;
  return true;
}

function _rtTransactions(evt, baru, lama) {
  const list = appState.transactions;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(t => t.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
  if (!baru || !baru.id) return false;
  const row = mapTransactionRow(baru);
  let i = list.findIndex(t => t.id === row.id);
  // Transaksi yang baru diinput di device ini sudah masuk appState sebelum
  // id-nya kembali dari server (saveTransaction tidak ditunggu). Kenali lewat
  // isinya supaya tidak tercatat dua kali, lalu pasangkan id-nya.
  if (i < 0) {
    i = list.findIndex(t => !t.id && t.nama === row.nama && t.time === row.time &&
                            t.nominal === row.nominal && t.jenis === row.jenis);
  }
  if (i < 0) {
    list.push(row);
    // Jaga panjangnya sama dengan yang ditarik loadTransactions(): daftar ini
    // memang hanya menyimpan transaksi terakhir, jangan menggelembung selama
    // aplikasi dibiarkan terbuka berjam-jam.
    const batas = (typeof TXN_TERAKHIR_LIMIT === 'number') ? TXN_TERAKHIR_LIMIT : 50;
    if (list.length > batas) list.splice(0, list.length - batas);
  } else list[i] = row;
  return true;
}

function _rtKuitansi() {
  // Kuitansi tidak disimpan di appState — hanya halaman Buku Induk yang
  // membacanya, dan halaman itu menarik datanya sendiri. Dulu satu kuitansi
  // baru memicu unduhan ulang santri + tagihan + transaksi yang tak dipakainya.
  if (typeof activePageId === 'function' && activePageId() === 'riwayat-kuitansi' &&
      typeof loadRiwayatKuitansi === 'function') {
    loadRiwayatKuitansi();
  }
  return true;
}

function _rtSettings() {
  // Item bayar sedang diedit di halaman Pengaturan — jangan ditimpa di tengah
  // pengeditan; serahkan ke jalur lama.
  if (typeof editingItemIdx !== 'undefined' && editingItemIdx >= 0) return false;
  if (typeof loadSettings !== 'function') return false;
  // Settings kecil (beberapa baris), jadi memuat ulang tabel itu saja sudah
  // cukup — jauh lebih murah daripada menarik seluruh data santri. Ini juga
  // menutup celah lama: syncNow() tidak pernah memuat ulang settings, sehingga
  // perubahan item bayar / profil dari device lain baru terlihat setelah reload.
  loadSettings().then(() => {
    if (typeof applyProfil === 'function')    applyProfil();
    if (typeof ensureBakuItems === 'function') ensureBakuItems();
    if (typeof renderItemList === 'function' && typeof activePageId === 'function' &&
        activePageId() === 'pengaturan') renderItemList();
    _rtJadwalkanRender();
  }).catch(() => {});
  return true;
}

// Terapkan satu event ke appState.
// true  → sudah diterapkan, tidak perlu menarik ulang apa pun.
// false → tidak bisa dipastikan; pemanggil menarik ulang seluruh data.
function _rtTerapkan(payload) {
  if (!payload) return false;
  // Payload yang terpotong (mis. "Error 413: Payload Too Large" untuk baris
  // dengan spp_history besar) tidak boleh dipercaya isinya.
  if (Array.isArray(payload.errors) && payload.errors.length) return false;
  // Proses panjang (import, promosi kelas) sedang menyentuh appState — jangan
  // diselipi perubahan dari device lain di tengah jalan.
  if (typeof isSyncPaused === 'function' && isSyncPaused()) return false;
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return false;

  const evt  = payload.eventType || payload.event;
  const baru = payload.new || null;
  const lama = payload.old || null;
  switch (payload.table) {
    case 'students':     return _rtStudents(evt, baru, lama);
    case 'tagihan':      return _rtTagihan(evt, baru, lama);
    case 'transactions': return _rtTransactions(evt, baru, lama);
    case 'kuitansi':     return _rtKuitansi();
    case 'settings':     return _rtSettings();
    default:             return false;   // tabel tak dikenal → aman: tarik ulang
  }
}

// Satu perubahan dari device lain.
function _onRealtimeChange(payload) {
  let ok = false;
  try { ok = _rtTerapkan(payload); }
  catch(e) { console.warn('realtime apply:', e.message); ok = false; }
  if (ok) { _rtJadwalkanRender(); return; }

  // Jalur lama (di-debounce): tarik ulang seluruh data.
  // syncNow() menghormati penjagaan (modal terbuka / proses panjang berjalan).
  // Bila dilewati, penanda "dirty" membuatnya dicoba lagi sesaat kemudian —
  // jadi tidak ada perubahan yang terlewat.
  clearTimeout(_rtDebounce);
  _rtDebounce = setTimeout(() => {
    if (typeof syncNow === 'function') syncNow();
  }, RT_DEBOUNCE_MS);
}

// Perbarui token pada koneksi Realtime (dipanggil tiap kali sesi di-refresh).
function realtimeSetAuth() {
  if (!_rtClient || !_rtClient.realtime) return;
  const token = (typeof hasAdminSession === 'function' && hasAdminSession())
    ? sbSession.access_token : null;
  if (!token) return;
  try {
    const r = _rtClient.realtime.setAuth(token);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch(e) { console.warn('realtimeSetAuth:', e.message); }
}

async function startRealtime() {
  _rtWanted = true;
  if (_rtChannel) return true;                       // sudah jalan
  if (typeof hasAdminSession !== 'function' || !hasAdminSession()) return false;

  const ok = await loadRealtimeLib();
  if (!ok) {
    console.warn('Realtime: pustaka Supabase gagal dimuat — tetap memakai polling berkala.');
    return false;
  }
  if (!_rtWanted) return false;                      // keburu logout saat memuat

  try {
    if (!_rtClient) {
      // persistSession/autoRefreshToken dimatikan: sesi admin dikelola sendiri
      // oleh config.js, jangan sampai pustaka ini ikut menulis localStorage.
      _rtClient = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    realtimeSetAuth();

    let ch = _rtClient.channel('sipay-db-changes');
    RT_TABLES.forEach(table => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, _onRealtimeChange);
    });

    _rtChannel = ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _setRealtimeStatus(true);
        clearTimeout(_rtRetry);
        // Tarik sekali saat tersambung untuk menutup celah antara halaman
        // dimuat dan channel siap — kecuali startAutoSync() baru saja menarik.
        const perlu = typeof syncedRecently !== 'function' || !syncedRecently();
        if (perlu && typeof syncNow === 'function') syncNow();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        _setRealtimeStatus(false);
        _scheduleRealtimeRetry();
      }
    });
    return true;
  } catch(e) {
    console.warn('startRealtime:', e.message);
    _setRealtimeStatus(false);
    _scheduleRealtimeRetry();
    return false;
  }
}

function _scheduleRealtimeRetry() {
  if (!_rtWanted) return;
  clearTimeout(_rtRetry);
  _rtRetry = setTimeout(() => {
    if (!_rtWanted) return;
    _teardownChannel();
    startRealtime();
  }, RT_RETRY_MS);
}

function _teardownChannel() {
  if (_rtChannel && _rtClient) {
    try { _rtClient.removeChannel(_rtChannel); } catch { /* best-effort */ }
  }
  _rtChannel = null;
}

function stopRealtime() {
  _rtWanted = false;
  clearTimeout(_rtRetry);
  clearTimeout(_rtDebounce);
  clearTimeout(_rtRenderTimer);
  _rtRenderTimer = null;
  _teardownChannel();
  _setRealtimeStatus(false);
}
;// ══ js/sync.js ══
// ── SiPay · Auto-Sync Lintas Device ──
// ══════════════════════════════════════════
// Semua data (santri, tagihan, transaksi, kuitansi, settings) tersimpan di
// Supabase — satu sumber data untuk semua device. Masalahnya dulu data itu
// HANYA ditarik satu kali, yaitu saat halaman dibuka. Akibatnya tab di device B
// tetap menampilkan kondisi lama walau device A sudah menginput.
//
// Modul ini menjaga semua device berada pada kondisi data terakhir, dengan dua
// jalur yang saling melengkapi:
//
//   1. REALTIME (js/realtime.js) — jalur utama. Perubahan dari device lain
//      masuk seketika lewat WebSocket, dan barisnya langsung dipasang ke
//      appState tanpa menarik apa pun. syncNow() di sini hanya dipanggil bila
//      perubahannya tidak bisa dipastikan.
//   2. POLLING — jaring pengaman. Tetap berjalan walau realtime aktif, hanya
//      dengan jeda yang jauh lebih longgar (2 menit vs 20 detik). Ini yang
//      menyelamatkan keadaan ketika WebSocket diblokir jaringan sekolah,
//      publication `supabase_realtime` belum diaktifkan, atau koneksi putus
//      diam-diam tanpa event error — dan sekaligus mengoreksi penyimpangan
//      bila ada event yang terlewat.
//
// Ditambah pemicu langsung: tab kembali aktif, jendela di-fokus, koneksi pulih,
// dan tombol 🔄 di topbar.
//
// Sinkron sengaja DILEWATI saat ada modal terbuka atau saat proses panjang
// berjalan (import, promosi kelas — lihat pauseAutoSync/resumeAutoSync), supaya
// isian yang sedang dikerjakan tidak ter-render ulang di tengah jalan. Yang
// dilewati tidak hilang: penanda "dirty" membuatnya dicoba lagi tak lama
// kemudian.
// ══════════════════════════════════════════

const SYNC_INTERVAL_MS    = 20000;   // jeda polling saat realtime TIDAK aktif
const SYNC_INTERVAL_RT_MS = 120000;  // jeda polling saat realtime aktif (jaring pengaman)
const SYNC_DIRTY_RETRY_MS = 1200;    // coba lagi cepat bila sinkron tertunda
const SYNC_MIN_GAP_MS     = 1000;    // jarak minimum antar sinkron (anti-spam)

let _syncTimer   = null;
let _syncRunning = false;
let _syncPaused  = 0;      // penghitung: >0 berarti sinkron otomatis ditahan
let _syncDirty   = false;  // ada perubahan yang belum sempat ditarik
let _lastSyncAt  = 0;

// Tahan/lanjutkan sinkron otomatis. Dipakai mengapit proses panjang (import,
// promosi kelas) agar datanya tidak ditarik ulang di tengah proses.
function pauseAutoSync()  { _syncPaused++; }
function resumeAutoSync() {
  if (_syncPaused > 0) _syncPaused--;
  if (_syncPaused === 0 && _syncDirty) rescheduleAutoSync();
}

// Jalankan fn dengan sinkron otomatis ditahan (selalu dilepas walau fn gagal).
async function withSyncPaused(fn) {
  pauseAutoSync();
  try { return await fn(); }
  finally { resumeAutoSync(); }
}

// Tandai ada perubahan yang perlu ditarik — dipakai saat sinkron dilewati.
function markSyncDirty() { _syncDirty = true; }

// Sedang menahan sinkron otomatis? Dipakai js/realtime.js: selama proses panjang
// (import, promosi kelas) berjalan, appState TIDAK boleh disisipi perubahan dari
// device lain di tengah jalan.
function isSyncPaused() { return _syncPaused > 0; }

// Baru saja tersinkron? Dipakai realtime.js agar tidak menarik ulang data yang
// sudah ditarik startAutoSync() beberapa ratus milidetik sebelumnya.
function syncedRecently(ms = 3000) { return Date.now() - _lastSyncAt < ms; }

function _anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

function _canAutoSync() {
  if (_syncPaused > 0) return false;
  if (document.hidden) return false;
  if (navigator.onLine === false) return false;
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return false;
  if (_anyModalOpen()) return false;
  return true;
}

// Label status koneksi di topbar (dipakai juga oleh loadDataForTA).
function connStatusLabel() {
  return (typeof isRealtimeActive === 'function' && isRealtimeActive()) ? 'Realtime' : 'Terhubung';
}

// Tarik ulang data dari Supabase.
//   manual = true → abaikan seluruh penjagaan (dipakai tombol 🔄).
// Return true bila data berhasil diperbarui.
async function syncNow(manual = false) {
  // Setiap kali sinkron dilewati, tandai "tertunda" DAN jadwalkan ulang timer —
  // supaya _nextDelay() memakai jeda pendek dan perubahannya segera menyusul.
  const skip = () => { _syncDirty = true; rescheduleAutoSync(); return false; };
  if (_syncRunning) return skip();
  if (!manual && !_canAutoSync()) return skip();
  // Baru saja sinkron → datanya sudah yang terbaru; ini BUKAN perubahan yang
  // tertunda. Dulu kasus ini ikut ditandai "dirty", sehingga tab yang kembali
  // aktif (visibilitychange + focus menyala hampir bersamaan) memicu tarikan
  // kedua atas seluruh data hanya 1,2 detik setelah tarikan pertama.
  if (!manual && Date.now() - _lastSyncAt < SYNC_MIN_GAP_MS) { rescheduleAutoSync(); return false; }

  _syncRunning = true;
  const btn = document.getElementById('syncNowBtn');
  if (btn) btn.classList.add('spinning');
  try {
    await loadDataForTA({ silent: !manual });
    _lastSyncAt = Date.now();
    _syncDirty  = false;
    return true;
  } catch(e) {
    console.warn('syncNow:', e.message);
    _syncDirty = true;   // gagal → coba lagi pada kesempatan berikutnya
    return false;
  } finally {
    _syncRunning = false;
    if (btn) btn.classList.remove('spinning');
    rescheduleAutoSync();
  }
}

// Dipanggil tombol 🔄 di topbar.
async function manualSync() {
  const ok = await syncNow(true);
  if (typeof toast === 'function') {
    toast(ok ? '🔄 Data disinkronkan dari server' : '⚠️ Gagal menyinkronkan — cek koneksi');
  }
}

// Jeda tik berikutnya: cepat bila ada perubahan tertunda, longgar bila realtime
// sedang aktif (polling cuma jadi jaring pengaman).
function _nextDelay() {
  if (_syncDirty) return SYNC_DIRTY_RETRY_MS;
  return (typeof isRealtimeActive === 'function' && isRealtimeActive())
    ? SYNC_INTERVAL_RT_MS : SYNC_INTERVAL_MS;
}

// Timer menjadwal ulang dirinya sendiri supaya jedanya bisa berubah mengikuti
// status realtime / penanda dirty.
function rescheduleAutoSync() {
  if (!_syncStarted) return;   // belum dinyalakan / sudah dihentikan
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    await syncNow();
    if (_syncStarted && !_syncTimer) rescheduleAutoSync();
  }, _nextDelay());
}

let _syncStarted = false;
function startAutoSync() {
  _syncStarted = true;
  clearTimeout(_syncTimer);
  _syncTimer = null;
  rescheduleAutoSync();
  syncNow();
  // Realtime dinyalakan setelahnya; kalau gagal, polling di atas tetap jalan.
  if (typeof startRealtime === 'function') startRealtime();
}

function stopAutoSync() {
  _syncStarted = false;
  clearTimeout(_syncTimer);
  _syncTimer = null;
  if (typeof stopRealtime === 'function') stopRealtime();
}

// Pemicu tambahan: tab kembali terlihat, jendela di-fokus, koneksi pulih.
// Ini yang membuat "buka lagi di device B" langsung menampilkan data terakhir
// tanpa perlu reload halaman — juga saat realtime kebetulan sedang putus.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Penulisan salinan lokal ditunda-tunda (lihat simpanSalinanLokal di
    // js/database.js). Saat tab ditinggalkan, paksa sekali supaya cadangan
    // offline-nya tetap mutakhir.
    if (typeof simpanSalinanLokal === 'function') simpanSalinanLokal(true);
  } else {
    syncNow();
  }
});
window.addEventListener('pagehide', () => {
  if (typeof simpanSalinanLokal === 'function') simpanSalinanLokal(true);
});
window.addEventListener('focus',  () => { syncNow(); });
window.addEventListener('online', () => { syncNow(); });
;// ══ js/init.js ══
// ── SiPay · App Initialization ──
// Pustaka Excel TIDAK lagi dimuat di sini. Lihat xlsxReady() di js/config.js:
// pustakanya ditarik saat menu Import/Export benar-benar dipakai.


document.addEventListener('DOMContentLoaded', async () => {
  // Modal click-outside listeners
  document.getElementById('detailModal').addEventListener('click', function(e) { if(e.target===this) closeModal(); });
  document.getElementById('profilModal').addEventListener('click', function(e) { if(e.target===this) closeProfilModal(); });
  document.getElementById('deleteModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('addSiswaModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('indukDetailModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('biManualModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('biMassalModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  applyProfil();

  // Pastikan sesi masih sah SEBELUM data apa pun dimuat atau digambar.
  // Dulu urutannya terbalik — initApp() berjalan lebih dulu, sempat memulihkan
  // data santri dari cache dan menggambarnya, baru sesinya diperiksa.
  if (hasAdminSession() && sbSession.expires_at && Date.now() > sbSession.expires_at - 60000) {
    await sbRefresh();
  }

  await initApp();

  if (isLoggedIn()) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    // Sinkron berkala + saat tab kembali aktif, supaya data yang diinput di
    // device lain langsung tampil tanpa perlu reload halaman.
    startAutoSync();
    showPage('dashboard');
  } else {
    // Bersihkan sisa penanda sesi lama (termasuk mode wali yang telah dihapus)
    localStorage.removeItem('sipay_auth');
    localStorage.removeItem('sipay_guest');
    // Tanpa sesi yang sah, jangan tinggalkan data apa pun di balik layar login.
    // Penjagaan ini menutup kasus token kadaluarsa: initApp() sempat berjalan
    // saat token masih ada, lalu sbRefresh() di atas gagal dan sesi dibuang —
    // salinan lokal yang terlanjur dimuat harus ikut dibersihkan.
    clearLocalData();
    setTimeout(() => document.getElementById('loginUser').focus(), 150);
  }
});
