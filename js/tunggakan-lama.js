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
  return `<div style="background:var(--danger-pale);border:1.5px solid var(--danger);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--danger);font-weight:600;margin-bottom:10px;">
    ⚠️ TA ${esc(y.ta)} sama dengan tahun ajaran berjalan${taBerjalan ? ` (${esc(taBerjalan)})` : ''} atau sesudahnya.
    <span style="font-weight:500;">Tahun berjalan sudah ditagih lewat SPP biasa, jadi baris ini tidak dihitung sebagai tunggakan TA lalu —
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
    '<div style="text-align:center;color:var(--text-muted);padding:32px;font-size:13px;">Memuat riwayat...</div>';
  document.getElementById('tunggakanLamaModal').classList.add('open');

  // Selalu mulai dari kondisi server, bukan salinan memori — supaya input dari
  // device lain tidak tertimpa tanpa sadar.
  let hist;
  try {
    hist = await loadSppHistory(nama);
  } catch (e) {
    document.getElementById('thBody').innerHTML =
      `<div style="color:var(--danger);font-size:13px;padding:16px;">Gagal memuat: ${esc(e.message)}</div>`;
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
      <div style="text-align:center;padding:28px 16px;border:1.5px dashed var(--border);border-radius:12px;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
          Belum ada riwayat tahun ajaran sebelumnya untuk santri ini.
        </div>
        <button class="btn btn-primary btn-sm" onclick="thAddTA()">➕ Tambah Tahun Ajaran</button>
      </div>`;
    thRenderFooter();
    return;
  }
  body.innerHTML = thDraft.map((y, i) => `<div id="th_card_${i}">${thCardHTML(y, i)}</div>`).join('') + `
    <div style="text-align:center;margin-top:4px;">
      <button class="btn btn-outline btn-sm" onclick="thAddTA()">➕ Tambah Tahun Ajaran</button>
    </div>`;
  thRenderFooter();
}

function thCardHTML(y, i) {
  const t = thRowTotals(y);
  const monthRows = MONTHS.map(m => {
    const c = y.months[m];
    const off = !c.tagih;
    return `<div style="display:grid;grid-template-columns:118px 1fr 1fr;gap:8px;align-items:center;padding:4px 0;${off ? 'opacity:.45;' : ''}">
      <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;cursor:pointer;">
        <input type="checkbox" ${c.tagih ? 'checked' : ''} onchange="thToggleMonth(${i},'${m}',this.checked)"
          style="accent-color:var(--primary);width:15px;height:15px;">
        ${MONTH_FULL[m]}
      </label>
      <input type="number" min="0" step="1000" value="${c.tagih ? c.n : ''}" ${off ? 'disabled' : ''}
        placeholder="nominal" oninput="thSetMonth(${i},'${m}','n',this.value)"
        style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:12.5px;font-family:inherit;width:100%;">
      <input type="number" min="0" step="1000" value="${c.tagih ? c.d : ''}" ${off ? 'disabled' : ''}
        placeholder="dibayar" oninput="thSetMonth(${i},'${m}','d',this.value)"
        style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:12.5px;font-family:inherit;width:100%;">
    </div>`;
  }).join('');

  return `<div style="border:1.5px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card);">
    <div id="th_warn_${i}">${thWarnHTML(y)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;margin-bottom:12px;">
      <div class="form-group" style="margin:0;">
        <label>Tahun Ajaran <span style="color:var(--danger)">*</span></label>
        <input type="text" value="${esc(y.ta)}" placeholder="2024/2025" oninput="thSetField(${i},'ta',this.value)">
      </div>
      <div class="form-group" style="margin:0;">
        <label>Kelas saat itu</label>
        <input type="text" value="${esc(y.kelas)}" placeholder="mis. 8" oninput="thSetField(${i},'kelas',this.value)">
      </div>
      <div class="form-group" style="margin:0;">
        <label>SPP per Bulan (Rp)</label>
        <input type="number" min="0" step="1000" value="${y.rate || ''}" placeholder="0" oninput="thSetField(${i},'rate',this.value)">
      </div>
      <button class="btn btn-danger btn-sm" onclick="thRemoveTA(${i})" title="Hapus tahun ajaran ini">🗑️</button>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'tagih12')" title="Centang 12 bulan & isi nominalnya dengan SPP per bulan">📌 Tagih 12 bulan</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'ratakan')" title="Samakan nominal semua bulan yang ditagih dengan SPP per bulan">🔄 Samakan nominal</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'lunas')">✅ Semua lunas</button>
      <button class="btn btn-outline btn-sm" onclick="thQuick(${i},'belum')">❌ Semua belum bayar</button>
    </div>

    <div style="display:grid;grid-template-columns:118px 1fr 1fr;gap:8px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding-bottom:6px;border-bottom:1px solid var(--border);">
      <div>Bulan ditagih</div><div>Nominal (Rp)</div><div>Sudah dibayar (Rp)</div>
    </div>
    ${monthRows}

    <div id="th_sum_${i}" style="margin-top:10px;">${thSummaryHTML(t)}</div>
  </div>`;
}

function thSummaryHTML(t) {
  if (!t.bulan) {
    return `<div style="background:var(--danger-pale);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--danger);font-weight:600;">
      ⚠️ Belum ada bulan yang ditagih — centang minimal 1 bulan, atau hapus tahun ajaran ini.
    </div>`;
  }
  return `<div style="background:var(--bg);border-radius:9px;padding:8px 12px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px;">
    <span>Ditagih: <strong>${t.bulan} bln</strong></span>
    <span>Tagihan: <strong>${rp(t.tagihan)}</strong></span>
    <span>Terbayar: <strong style="color:var(--primary-light);">${rp(t.dibayar)}</strong></span>
    <span>Sisa: <strong style="color:${t.sisa > 0 ? 'var(--danger)' : 'var(--primary-light)'};">${t.sisa > 0 ? rp(t.sisa) + ` (${t.menunggak} bln)` : '✅ Lunas'}</strong></span>
  </div>`;
}

function thRenderFooter() {
  const total = thDraft.reduce((a, y) => a + thRowTotals(y).sisa, 0);
  const el = document.getElementById('thTotal');
  if (el) el.innerHTML = thDraft.length
    ? `Total tunggakan TA sebelumnya: <strong style="color:${total > 0 ? 'var(--danger)' : 'var(--primary-light)'};">${rp(total)}</strong>`
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
