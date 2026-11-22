// Gabungkan semua file js/*.js menjadi satu js/app.js (dimuat index.html).
// Jalankan setiap kali mengubah file di js/:   node scripts/build.js
// Tanpa dependensi. Urutan di bawah = urutan muat lama (penting: file
// belakangan memakai fungsi/konstanta dari file sebelumnya).
const fs = require('fs'), path = require('path');

const FILES = [
  'config', 'database', 'tahun-ajaran', 'helpers', 'dashboard', 'input', 'siswa',
  'tunggakan', 'items', 'cetak', 'profil', 'manajemen-siswa', 'import',
  'import-tunggakan', 'tunggakan-lama', 'auth', 'guest', 'akun', 'kuitansi',
  'buku-induk', 'koreksi', 'template-kuitansi', 'spmb', 'audit', 'realtime',
  'sync', 'init',
];
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'app.js');

function bundle() {
  // ';' di awal tiap bagian mencegah dua file "menyambung" lewat ASI.
  return '// HASIL BUILD — jangan diedit langsung. Ubah file di js/, lalu: node scripts/build.js\n'
    + FILES.map(f => `;// ══ js/${f}.js ══\n` + fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8').replace(/\s*$/, '\n')).join('');
}

// Semua file di js/ (selain app.js) harus terdaftar, supaya tidak ada yang tertinggal.
function cekDaftar() {
  const ada = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'app.js').map(f => f.slice(0, -3));
  const hilang = ada.filter(f => !FILES.includes(f));
  const lebih = FILES.filter(f => !ada.includes(f));
  if (hilang.length || lebih.length) throw new Error(`Daftar FILES di scripts/build.js tidak cocok — belum terdaftar: ${hilang} | tidak ada: ${lebih}`);
}

module.exports = { bundle, cekDaftar, OUT };
if (require.main === module) {
  cekDaftar();
  fs.writeFileSync(OUT, bundle());
  console.log('js/app.js ditulis —', fs.statSync(OUT).size, 'byte dari', FILES.length, 'file');
}
