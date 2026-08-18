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

function toast(msg, dur=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
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
  if(id==='tunggakan') renderTunggakan();
  if(id==='spmb') renderSpmbPage();
  if(id==='pengaturan') renderItemList();
  if(id==='input') renderInputPage();
  if(id==='cetak') renderCetakPage();
  if(id==='template-kuitansi') renderTemplateKuitansiPage();
  if(id==='riwayat-kuitansi') { if(typeof renderBukuIndukPage==='function') renderBukuIndukPage(); loadRiwayatKuitansi(); }
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
  return sppDueMonths(ref).filter(m => !paid.includes(m));
}

// Bulan yang belum jatuh tempo & belum dibayar — bukan tunggakan, tapi tetap
// bisa dipilih di form Input Pembayaran sebagai pembayaran di muka.
function sppUpcomingMonths(s, ref) {
  if (!s || s.status_kelulusan === 'lulus') return [];
  const paid = s.spp_paid_months || [];
  const due = sppDueMonths(ref);
  return MONTHS.filter(m => !due.includes(m) && !paid.includes(m));
}

function sppTunggakan(s) {
  // Lulusan tidak punya kewajiban SPP tahun berjalan — SPP-nya sudah diarsipkan
  // ke spp_history (dihitung sebagai tunggakan tahun lalu). Tanpa ini, bulan
  // yang direset saat lulus akan tampil sebagai 12 bulan "belum bayar" palsu.
  if (s.status_kelulusan === 'lulus') return 0;
  if (!s.spp || s.spp === 0) return 0;
  return sppUnpaidDueMonths(s).length * s.spp;
}

// Arsipkan SPP tahun berjalan ke riwayat (spp_history) SEBELUM spp_paid_months
// direset, agar bulan yang belum dibayar tetap tercatat sebagai tunggakan tahun
// lalu & bisa dibayar di tahun ajaran baru. Dipakai saat promosi kelas dan saat
// menandai santri LULUS. Disimpan sekali per label TA (tidak menimpa snapshot).
function snapshotSppTahunBerjalan(s, ta) {
  if (!ta || !((s.spp || 0) > 0)) return;
  s.spp_history = (s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
  if (!s.spp_history[ta]) {
    s.spp_history[ta] = { spp: s.spp || 0, spp_paid_months: [...(s.spp_paid_months || [])] };
  }
}

// Tunggakan dari tabel tagihan (semua item tetap)
function itemsTunggakan(s) {
  return appState.tagihan
    .filter(t => t.nama === s.nama)
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

// Tandai bulan-bulan tunggakan TA lama sebagai LUNAS setelah dibayar.
// Menyentuh dua tempat sekaligus supaya bentuk ringkas & rinci tetap konsisten.
function markSppHistPaid(stu, ta, rate, monthCodes) {
  if (!stu || !ta) return;
  stu.spp_history = (stu.spp_history && typeof stu.spp_history === 'object' && !Array.isArray(stu.spp_history))
    ? stu.spp_history : {};
  const rec = stu.spp_history[ta] || (stu.spp_history[ta] = { spp: Number(rate) || 0, spp_paid_months: [] });
  if (!Array.isArray(rec.spp_paid_months)) rec.spp_paid_months = [];
  (monthCodes || []).forEach(m => {
    if (rec.months && rec.months[m]) rec.months[m].d = Math.max(0, Number(rec.months[m].n) || 0);
    if (!rec.spp_paid_months.includes(m)) rec.spp_paid_months.push(m);
  });
}

// Total nominal tunggakan SPP dari seluruh tahun ajaran sebelumnya.
function sppTunggakanPrev(s) {
  return sppTunggakanPrevList(s).reduce((sum, y) => sum + y.amount, 0);
}

function totalTunggakan(s) {
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

function crossTATunggakan(s) { return 0; }

// ── DASHBOARD ──
