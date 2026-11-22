// Pastikan js/app.min.js (+ .map) sama dengan hasil build dari file js/ terbaru.
// Jalankan: npm test — gagal berarti lupa `npm run build`.
const fs = require('fs'), assert = require('assert');
const { build, cekDaftar, OUT, OUT_MAP } = require('../scripts/build.js');
cekDaftar();
build().then(({ code, map }) => {
  assert.strictEqual(fs.readFileSync(OUT, 'utf8'), code, 'js/app.min.js usang — jalankan: npm run build');
  assert.strictEqual(fs.readFileSync(OUT_MAP, 'utf8'), map, 'js/app.min.js.map usang — jalankan: npm run build');
  console.log('✅ js/app.min.js sesuai dengan sumber di js/');
}).catch(e => { console.error(e.message); process.exit(1); });
