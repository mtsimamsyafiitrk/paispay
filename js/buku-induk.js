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
  if (dl) dl.innerHTML = (appState.payItems || []).map(i => `<option value="${esc(i.name)}">`).join('');
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
    .concat(MONTHS.map(m => `<option value="${m}">${esc(MONTH_FULL[m] || m)}</option>`)).join('');
  return `<div class="bi-item-row" style="display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center;">
    <input type="text" class="bi-item-name" list="bi_item_names" placeholder="Nama item (mis. SPP)"
      style="padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;">
    <input type="text" class="bi-item-nominal" inputmode="numeric" placeholder="Nominal (Rp)" oninput="biRecalcTotal()"
      style="padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;">
    <select class="bi-item-bulan" style="padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:inherit;outline:none;">${bulanOpts}</select>
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

  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Menyimpan...'; }
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
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Simpan ke Buku Induk'; }
  }
}

function biRenderSession() {
  const wrap = document.getElementById('bi_session_wrap');
  if (!wrap) return;
  if (!indukSession.length) {
    wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:18px;font-size:13px;">Belum ada entri pada sesi ini.</div>';
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table class="data-table">
    <thead><tr><th>No. Induk</th><th>Nama</th><th>Kelas</th><th>TA</th><th style="text-align:right;">Total</th><th>Status</th></tr></thead>
    <tbody>${indukSession.map(s => `<tr>
      <td style="font-weight:700;font-size:12px;color:var(--primary);">${esc(s.no_kuitansi)}</td>
      <td><strong>${esc(s.nama)}</strong></td>
      <td>${esc(s.kelas || '—')}</td>
      <td>${esc(s.ta_label || '—')}</td>
      <td style="text-align:right;font-weight:700;">${rp(s.total)}</td>
      <td>${s.incomplete
        ? `<span title="${esc(s.masalah)}" style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">⚠️ Tidak lengkap</span>`
        : '<span style="background:#dcfce7;color:#166534;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">✅ Lengkap</span>'}</td>
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
  } else if (typeof XLSX !== 'undefined') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        indukParseRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
      } catch (err) { toast('⚠️ Gagal membaca file: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  } else {
    toast('⚠️ Library Excel belum siap. Coba refresh atau gunakan format CSV.');
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
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <span style="background:var(--primary-pale);color:var(--primary);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">${indukBuffer.length} baris terbaca</span>
      ${tidakLengkap ? `<span style="background:#fef3c7;color:#b45309;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">⚠️ ${tidakLengkap} baris tidak lengkap</span>` : '<span style="background:#dcfce7;color:#166534;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">✅ Semua lengkap</span>'}
    </div>
    <div class="table-wrap" style="max-height:340px;overflow:auto;"><table class="data-table">
      <thead><tr><th>#</th><th>TA</th><th>Nama</th><th>Kelas</th><th>Item</th><th style="text-align:right;">Nominal</th><th>Bulan</th><th>Status</th></tr></thead>
      <tbody>${indukBuffer.map((r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.ta || '—')}</td>
        <td><strong>${esc(r.nama || '—')}</strong></td>
        <td>${esc(r.kelas || '—')}</td>
        <td>${esc(r.item || '—')}</td>
        <td style="text-align:right;">${r.nominal ? rp(r.nominal) : '—'}</td>
        <td>${esc(r.bulan ? (MONTH_FULL[r.bulan] || r.bulan) : '—')}</td>
        <td>${r.reasons.length
          ? `<span title="${esc(r.reasons.join('; '))}" style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">⚠️ ${esc(r.reasons.join('; '))}</span>`
          : '<span style="background:#dcfce7;color:#166534;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">✅ Lengkap</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  if (btn) { btn.style.display = 'inline-flex'; btn.disabled = false; btn.innerHTML = `💾 Simpan ${indukBuffer.length} Entri ke Buku Induk`; }
}

async function confirmImportInduk() {
  if (!indukBuffer.length) { toast('⚠️ Tidak ada data untuk disimpan'); return; }
  const btn = document.getElementById('bi_confirm_btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Menyimpan...'; }
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
      `<div style="text-align:center;padding:24px;color:var(--primary);font-weight:700;">✅ ${n} entri berhasil disimpan ke Buku Induk.</div>`;
    if (btn) btn.style.display = 'none';
    const fileEl = document.getElementById('bi_massal_file');
    if (fileEl) fileEl.value = '';
    toast(`✅ ${n} entri tersimpan ke Buku Induk`);
    if (typeof loadRiwayatKuitansi === 'function') loadRiwayatKuitansi();
  } catch (e) {
    console.error('confirmImportInduk:', e);
    toast('⚠️ Gagal menyimpan: ' + (e.message || e));
    if (btn) { btn.disabled = false; btn.innerHTML = `💾 Simpan ${indukBuffer.length} Entri ke Buku Induk`; }
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

function downloadTemplateInduk() {
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
  body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Memuat...</div>';
  modal.classList.add('open');
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { body.innerHTML = '<div style="color:var(--danger);padding:16px;">Data tidak ditemukan.</div>'; return; }
    body.innerHTML = renderIndukDetail(rows[0]);
  } catch (e) {
    body.innerHTML = `<div style="color:var(--danger);padding:16px;">Gagal memuat: ${esc(e.message || e)}</div>`;
  }
}
function closeIndukDetail() {
  document.getElementById('indukDetailModal')?.classList.remove('open');
}
function renderIndukDetail(r) {
  const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const incomplete = indukIncomplete(r);
  const masalah = indukMasalah(r);
  const catatan = indukCatatanAsli(r);
  const induk = isIndukKwt(r);
  const items = Array.isArray(r.items) ? r.items : [];

  const warning = incomplete ? `
    <div style="background:var(--danger-pale);border-left:4px solid var(--danger);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
      <div style="font-weight:800;font-size:13px;color:var(--danger);margin-bottom:3px;">⚠️ Data tidak lengkap</div>
      <div style="font-size:12.5px;color:var(--text);">${esc(masalah || 'Sebagian data pembayaran ini tidak tercatat lengkap dari arsip lama.')}</div>
    </div>` : '';

  const badges = `
    ${induk ? '<span style="background:var(--primary-pale);color:var(--primary);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">📖 Buku Induk</span>' : ''}
    ${incomplete ? '<span style="background:#fef3c7;color:#b45309;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">⚠️ Tidak lengkap</span>' : ''}`;

  const rowsHtml = items.length ? items.map(it => `<tr>
      <td>${esc(it.name || '—')}${it.bulan ? ` <span style="color:var(--text-muted);font-size:11px;">(${esc(MONTH_FULL[it.bulan] || it.bulan)})</span>` : ''}</td>
      <td style="text-align:right;">${it.amount ? rp(it.amount) : '<span style="color:var(--danger);">— tidak tercatat</span>'}</td>
    </tr>`).join('') : '<tr><td colspan="2" style="color:var(--text-muted);">Tidak ada rincian.</td></tr>';

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">${badges}</div>
    ${warning}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
      <div><div style="font-size:11px;color:var(--text-muted);">Nama</div><div style="font-weight:700;">${esc(r.nama || '—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Kelas</div><div style="font-weight:700;">${esc(r.kelas || '—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Tahun Ajaran</div><div style="font-weight:700;">${esc(r.ta_label || '—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Tanggal</div><div style="font-weight:700;">${tgl}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">No.</div><div style="font-weight:700;">${esc(r.no_kuitansi || '—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">NISN</div><div style="font-weight:700;">${esc(r.nisn || '—')}</div></div>
    </div>
    <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:6px;">📋 Rincian Pembayaran</div>
    <div class="table-wrap" style="margin-bottom:12px;"><table class="data-table">
      <thead><tr><th>Item</th><th style="text-align:right;">Nominal</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot><tr><td style="font-weight:800;">Total</td><td style="text-align:right;font-weight:800;color:var(--primary-light);">${rp(r.total)}</td></tr></tfoot>
    </table></div>
    ${catatan ? `<div style="background:var(--bg);border-radius:10px;padding:10px 12px;font-size:12.5px;"><strong>Catatan:</strong> ${esc(catatan)}</div>` : ''}`;
}
