// Gabungkan + perkecil (minify) semua file js/*.js menjadi js/app.min.js
// (dimuat index.html) beserta source map js/app.min.js.map — error di konsol
// browser tetap menunjuk ke file & baris asli di js/.
// Jalankan setiap kali mengubah file di js/:   npm run build
// (sekali saja sebelumnya: npm install). Urutan di bawah = urutan muat:
// file belakangan memakai fungsi/konstanta dari file sebelumnya.
const fs = require('fs'), path = require('path');
const { minify } = require('terser');

const FILES = [
  'config', 'database', 'tahun-ajaran', 'helpers', 'dashboard', 'input', 'siswa',
  'tunggakan', 'items', 'cetak', 'profil', 'manajemen-siswa', 'import',
  'import-tunggakan', 'tunggakan-lama', 'auth', 'guest', 'akun', 'kuitansi',
  'buku-induk', 'koreksi', 'template-kuitansi', 'spmb', 'audit', 'realtime',
  'sync', 'init',
];
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'app.min.js');
const OUT_MAP = OUT + '.map';
const BUILT = ['app.min.js'];

async function build() {
  const sources = {};
  for (const f of FILES) sources[f + '.js'] = fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8');
  const r = await minify(sources, {
    // Nama tingkat atas TIDAK diubah: dipanggil dari onclick="..." di HTML.
    toplevel: false,
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false, preamble: '/* HASIL BUILD — jangan diedit. Sumber: js/*.js · buat ulang: npm run build */' },
    sourceMap: { filename: 'app.min.js', url: 'app.min.js.map' },
  });
  return { code: r.code + '\n', map: r.map + '\n' };
}

// Semua file di js/ (selain hasil build) harus terdaftar, supaya tidak ada yang tertinggal.
function cekDaftar() {
  const ada = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !BUILT.includes(f)).map(f => f.slice(0, -3));
  const hilang = ada.filter(f => !FILES.includes(f));
  const lebih = FILES.filter(f => !ada.includes(f));
  if (hilang.length || lebih.length) throw new Error(`Daftar FILES di scripts/build.js tidak cocok — belum terdaftar: ${hilang} | tidak ada: ${lebih}`);
}

module.exports = { build, cekDaftar, OUT, OUT_MAP };
if (require.main === module) {
  cekDaftar();
  build().then(({ code, map }) => {
    fs.writeFileSync(OUT, code); fs.writeFileSync(OUT_MAP, map);
    const asli = FILES.reduce((a, f) => a + fs.statSync(path.join(ROOT, 'js', f + '.js')).size, 0);
    console.log(`js/app.min.js ditulis — ${code.length} byte (sumber ${asli} byte, ${FILES.length} file)`);
  }).catch(e => { console.error(e); process.exit(1); });
}
