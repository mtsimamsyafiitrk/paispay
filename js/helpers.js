// ── SiPay · Helpers, Nav & Student Utilities ──
const rp = n => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const pct = (a,b) => b ? Math.round(a/b*100) : 0;

function kelasLabel(s) {
  const sk = s.status_kelulusan || '';
  if (sk === 'lulus')  return 'Lulus';
  if (sk === 'pindah') return 'Pindah';
  if (sk === 'keluar') return 'Keluar';
  return s.kelas;
}

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
    pengaturan:['Kelola Item Bayar','Atur item pembayaran'],cetak:['Cetak / PDF','Export rekap dan surat tagihan'],'tahun-ajaran':['Tahun Ajaran','Kelola & pindah tahun ajaran'],akun:['Akun Admin','Pengaturan akun & keamanan'],
    pengunjung:['Info Pembayaran','Detail pembayaran & tunggakan santri'],
    lapor:['Lapor Pembayaran','Laporkan pembayaran yang belum terdata'],
    'laporan-masuk':['Laporan Masuk','Verifikasi laporan pembayaran dari wali santri'],
    'template-kuitansi':['Template Kuitansi','Atur tampilan kuitansi pembayaran'],
    'riwayat-kuitansi':['Riwayat Kuitansi','Daftar seluruh kuitansi yang telah dibuat']};
  const t = titles[id]||[id,id];
  document.getElementById('pageTitle').textContent = t[0];
  document.getElementById('pageSubtitle').textContent = t[1];

  // Kelola sidebar admin vs guest
  const sidebarAdmin = document.getElementById('sidebar');
  const sidebarGuest = document.getElementById('sidebarGuest');
  if (isGuest()) {
    sidebarAdmin.style.display = 'none';
    sidebarGuest.style.display = 'flex';
    document.querySelector('.main-content').style.marginLeft = '';
  } else {
    sidebarAdmin.style.display = '';
    sidebarGuest.style.display = 'none';
    document.querySelector('.main-content').style.marginLeft = '';
  }

  closeSidebar();
  if(id==='dashboard') renderDashboard();
  if(id==='rekap-siswa') renderSiswaTable();
  if(id==='tunggakan') renderTunggakan();
  if(id==='pengaturan') renderItemList();
  if(id==='input') renderInputPage();
  if(id==='cetak') renderCetakPage();
  if(id==='pengunjung') renderGuestPage();
  if(id==='lapor') renderLaporPage();
  if(id==='laporan-masuk') loadLaporanMasuk();
  if(id==='template-kuitansi') renderTemplateKuitansiPage();
  if(id==='riwayat-kuitansi') loadRiwayatKuitansi();
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

function sppTunggakan(s) {
  const history = s.spp_history || {};
  let total = 0;
  // Tunggakan tahun-tahun lalu dari spp_history
  Object.values(history).forEach(taData => {
    if (!taData.spp || taData.spp === 0) return;
    const belum = MONTHS.filter(m => !(taData.spp_paid_months||[]).includes(m)).length;
    total += belum * taData.spp;
  });
  // Tunggakan tahun berjalan (main field)
  if (s.spp && s.spp > 0) {
    const belum = MONTHS.filter(m => !(s.spp_paid_months||[]).includes(m)).length;
    total += belum * s.spp;
  }
  return total;
}
function pangkalTunggakan(s) {
  const history = s.spp_history || {};
  if (Object.keys(history).length > 0) {
    return Object.values(history).reduce((total, taData) => {
      return total + Math.max(0, (taData.pangkal||0) - (taData.pangkal_paid||0));
    }, 0);
  }
  if (!s.pangkal || s.pangkal === 0) return 0;
  return Math.max(0, s.pangkal - (s.pangkal_paid || 0));
}
function crossTATunggakan(s) { return 0; }
function totalTunggakan(s) { return sppTunggakan(s) + pangkalTunggakan(s); }

// ── DASHBOARD ──
