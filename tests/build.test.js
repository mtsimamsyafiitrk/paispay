// Pastikan js/app.js sama dengan hasil gabungan file di js/ terbaru.
// Jalankan: node tests/build.test.js — gagal berarti lupa `node scripts/build.js`.
const fs = require('fs'), assert = require('assert');
const { bundle, cekDaftar, OUT } = require('../scripts/build.js');
cekDaftar();
assert.strictEqual(fs.readFileSync(OUT, 'utf8'), bundle(), 'js/app.js usang — jalankan: node scripts/build.js');
console.log('✅ js/app.js sesuai dengan sumber di js/');
