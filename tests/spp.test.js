// Tes logika uang SPP (angsuran, pelunasan, pembatalan, keranjang).
// Jalankan: node tests/spp.test.js   — tanpa dependensi, tanpa browser.
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');

const noop = () => null;
const ctx = { console, localStorage: { getItem: noop, setItem: noop },
  document: { addEventListener: noop, getElementById: noop }, window: {} };
vm.createContext(ctx);
for (const f of ['js/config.js', 'js/helpers.js', 'js/input.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const run = code => vm.runInContext(code, ctx);
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);

// ── SPP tahun berjalan: angsur → pelunasan → batal ──
run(`var s = { spp: 100000, spp_paid_months: ['Jul'], spp_angsur: {} }`);
run(`applySppCurDelta(s, 'Agt', 40000)`);
eq(run('s'), { spp: 100000, spp_paid_months: ['Jul'], spp_angsur: { Agt: 40000 } }, 'angsur tercatat');
assert.strictEqual(run(`sppBulanSisa(s, 'Agt')`), 60000, 'sisa angsuran');
run(`applySppCurDelta(s, 'Agt', 60000)`);
eq(run('s.spp_paid_months'), ['Jul', 'Agt'], 'angsuran genap → lunas');
eq(run('s.spp_angsur'), {}, 'angsuran dihapus setelah lunas');
run(`applySppCurDelta(s, 'Agt', -60000)`);
eq(run('[s.spp_paid_months, s.spp_angsur]'), [['Jul'], { Agt: 40000 }], 'batal pelunasan → kembali angsur');
run(`applySppCurDelta(s, 'Agt', -40000)`);
eq(run('s.spp_angsur'), {}, 'batal angsur → kosong');

// Tunggakan hanya menghitung sisa (bulan-bulan yang sudah jatuh tempo).
run(`var t = { spp: 100000, spp_paid_months: [], spp_angsur: { Jul: 30000 } }`);
const due = run('sppDueMonthsFor(t).length');
assert.strictEqual(run('sppTunggakan(t)'), due ? due * 100000 - 30000 : 0, 'tunggakan dikurangi angsuran');

// ── Tunggakan TA lama ──
run(`var h = { spp_history: { '2024/2025': { spp: 50000, spp_paid_months: ['Jul'] } } }`);
run(`applySppHistDelta(h, '2024/2025', 'Agt', 50000, 50000)`);
assert.strictEqual(run(`h.spp_history['2024/2025'].months`), undefined, 'lunas penuh tetap bentuk ringkas');
run(`applySppHistDelta(h, '2024/2025', 'Sep', 20000, 50000)`);
eq(run(`h.spp_history['2024/2025'].months.Sep`), { n: 50000, d: 20000 }, 'angsuran TA lama');
assert.strictEqual(run(`sppTunggakanPrev(h)`), 9 * 50000 + 30000, 'tunggakan TA lama = sisa');
run(`applySppHistDelta(h, '2024/2025', 'Sep', Infinity, 50000)`);
assert.ok(run(`h.spp_history['2024/2025'].spp_paid_months.includes('Sep')`), 'Infinity = lunasi');

// ── Membalik item kuitansi ──
eq(run(`sppRevertOp({ name: 'SPP Tunggakan TA 2024/2025', bulan: 'Jul', amount: 5 }, -1)`),
  { hist: { ta: '2024/2025', m: 'Jul', delta: -5 } }, 'item TA lama dikenali dari nama');
eq(run(`sppRevertOp({ name: 'SPP Bulanan (Angsur)', bulan: 'Nov', amount: 150000, angsur: true }, -1)`),
  { cur: { m: 'Nov', delta: -150000 } }, 'angsuran dibatalkan sebesar nominalnya');
eq(run(`sppRevertOp({ name: 'SPP Bulanan', bulan: 'Sep', amount: 100000 }, -1)`),
  { cur: { m: 'Sep', remove: true } }, 'bulan lunas biasa dibatalkan utuh');

// ── Keranjang → item kuitansi ──
const items = run(`linesToItems([
  { kind: 'cur', id: 'spp', base: 'SPP Bulanan', m: 'Sep', amount: 400000, max: 400000, paidBefore: 0 },
  { kind: 'cur', id: 'spp', base: 'SPP Bulanan', m: 'Okt', amount: 400000, max: 400000, paidBefore: 0 },
  { kind: 'cur', id: 'spp', base: 'SPP Bulanan', m: 'Nov', amount: 150000, max: 400000, paidBefore: 0 },
  { kind: 'cur', id: 'spp', base: 'SPP Bulanan', m: 'Des', amount: 250000, max: 250000, paidBefore: 150000 },
  { kind: 'prev', id: 'spp', ta: '2024/2025', rate: 80000, m: 'Mei', amount: 25000, max: 80000, paidBefore: 0 },
  { kind: 'tetap', id: 'pangkal', base: 'Uang Pangkal', amount: 500000, max: 2500000 },
])`);
eq(items.map(i => [i.name, i.amount, i.bulanList || null, i.angsurMonths || null]), [
  ['SPP Bulanan', 800000, ['Sep', 'Okt'], []],
  ['SPP Bulanan (Angsur)', 150000, ['Nov'], ['Nov']],
  ['SPP Bulanan (Pelunasan Angsur)', 250000, ['Des'], ['Des']],
  ['SPP Tunggakan TA 2024/2025 (Angsur)', 25000, ['Mei'], ['Mei']],
  ['Uang Pangkal (Angsur)', 500000, null, null],
], 'keranjang dikelompokkan & ditandai benar');
assert.strictEqual(items[3].ta, '2024/2025', 'item TA lama membawa ta');

console.log('✅ Semua tes SPP lulus');
