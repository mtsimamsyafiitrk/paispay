// ── SiPay · SPMB (Sistem Penerimaan Murid Baru) ──

let spmbSelectedRows = new Set();

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
  const totalPendaftaran = list.reduce((s, c) => s + (c.uang_pendaftaran_paid || 0), 0);
  const totalPangkal = list.reduce((s, c) => s + (c.pangkal_paid || 0), 0);
  const totalSisaPendaftaran = list.reduce((s, c) => s + pendaftaranTunggakan(c), 0);

  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--accent-pale);color:var(--accent);">⭐</div>
      <div class="stat-info">
        <div class="stat-label">Total Calon Santri</div>
        <div class="stat-value">${totalCalon} orang</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--primary-pale);color:var(--primary-light);">💳</div>
      <div class="stat-info">
        <div class="stat-label">Terkumpul Pendaftaran</div>
        <div class="stat-value" style="font-size:15px;">${rp(totalPendaftaran)}</div>
        ${totalSisaPendaftaran > 0 ? `<div style="font-size:11px;color:var(--danger);margin-top:2px;">Sisa: ${rp(totalSisaPendaftaran)}</div>` : ''}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--primary-pale);color:var(--primary-light);">🏛️</div>
      <div class="stat-info">
        <div class="stat-label">Terkumpul Pangkal</div>
        <div class="stat-value" style="font-size:15px;">${rp(totalPangkal)}</div>
      </div>
    </div>
  `;
}

function _renderSpmbTable(list) {
  const tbody = document.getElementById('spmbTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">
      Belum ada calon santri.<br>
      <span style="font-size:12px;">Klik <strong>Tambah Calon</strong> atau <strong>Import Excel</strong> untuk mulai.</span>
    </td></tr>`;
    const chkAll = document.getElementById('spmbChkAll');
    if (chkAll) chkAll.checked = false;
    return;
  }

  tbody.innerHTML = list.map((s, i) => {
    const sisaPendaftaran = pendaftaranTunggakan(s);
    const sisaPangkal = pangkalTunggakan(s);
    const pendaftaranOk = sisaPendaftaran <= 0;
    const pangkalOk = sisaPangkal <= 0 && (s.pangkal || 0) > 0;
    const sel = spmbSelectedRows.has(s.nama);
    const nameSafe = s.nama.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    const pendaftaranBadge = s.uang_pendaftaran > 0
      ? (pendaftaranOk
        ? `<span style="font-size:11px;font-weight:700;color:var(--primary-light);">✅ Lunas</span>`
        : `<div style="font-size:12px;">${rp(s.uang_pendaftaran_paid||0)} / ${rp(s.uang_pendaftaran)}</div>
           <div style="font-size:11px;color:var(--danger);">Sisa ${rp(sisaPendaftaran)}</div>`)
      : `<span style="color:var(--text-muted);font-size:12px;">—</span>`;

    const pangkalBadge = s.pangkal > 0
      ? (pangkalOk
        ? `<span style="font-size:11px;font-weight:700;color:var(--primary-light);">✅ Lunas</span>`
        : `<div style="font-size:12px;">${rp(s.pangkal_paid||0)} / ${rp(s.pangkal)}</div>
           <div style="font-size:11px;color:var(--danger);">Sisa ${rp(sisaPangkal)}</div>`)
      : `<span style="color:var(--text-muted);font-size:12px;">—</span>`;

    return `<tr>
      <td><input type="checkbox" class="spmb-row-chk" data-nama="${s.nama.replace(/"/g,'&quot;')}"
        ${sel ? 'checked' : ''} onchange="toggleSpmbRowSelect(this)"
        style="width:15px;height:15px;accent-color:var(--primary);"></td>
      <td>${i + 1}</td>
      <td>
        <div style="font-weight:600;font-size:13px;">${s.nama}</div>
        ${s.nisn ? `<div style="font-size:11px;color:var(--text-muted);">NISN: ${s.nisn}</div>` : ''}
      </td>
      <td><span style="font-weight:700;font-size:14px;">Kelas ${s.kelas}</span></td>
      <td>${pendaftaranBadge}</td>
      <td>${pangkalBadge}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm btn-accent" onclick="confirmPromoteSingle('${nameSafe}')" title="Promosikan ke siswa aktif" style="font-size:11px;">🎓 Promosi</button>
        <button class="btn btn-sm btn-outline" onclick="openEditCalonModal('${nameSafe}')" title="Edit data" style="font-size:11px;">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCalonSantri('${nameSafe}')" title="Hapus" style="font-size:11px;">🗑️</button>
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
  ['calon_nama','calon_nisn','calon_pendaftaran','calon_pangkal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('calon_kelas').value = '';
  document.getElementById('addCalonModal').classList.add('open');
  setTimeout(() => document.getElementById('calon_nama')?.focus(), 100);
}

function saveCalonSantri() {
  const nama = (document.getElementById('calon_nama').value || '').trim().toUpperCase();
  const kelas = document.getElementById('calon_kelas').value;
  if (!nama) { toast('⚠️ Nama calon santri wajib diisi!'); return; }
  if (!kelas) { toast('⚠️ Kelas target wajib dipilih!'); return; }

  if (appState.students.find(s => s.nama === nama)) {
    toast('⚠️ Nama sudah ada di data santri!'); return;
  }

  const nisn = (document.getElementById('calon_nisn').value || '').trim();
  const uang_pendaftaran = Number(document.getElementById('calon_pendaftaran').value) || 0;
  const pangkal = Number(document.getElementById('calon_pangkal').value) || 0;

  const newCalon = {
    nama, kelas, nisn,
    spp: 0, spp_paid_months: [], spp_history: {},
    pangkal, pangkal_paid: 0,
    uang_pendaftaran, uang_pendaftaran_paid: 0,
    status_kelulusan: 'calon',
  };

  appState.students.push(newCalon);
  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  saveSiswa(newCalon);
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
  document.getElementById('edit_calon_pendaftaran').value = s.uang_pendaftaran || '';
  document.getElementById('edit_calon_pangkal').value = s.pangkal || '';
  document.getElementById('editCalonModal').classList.add('open');
}

function saveEditCalonSantri() {
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
    uang_pendaftaran: Number(document.getElementById('edit_calon_pendaftaran').value) || 0,
    pangkal: Number(document.getElementById('edit_calon_pangkal').value) || 0,
  };

  if (newNama !== origNama) {
    appState.transactions.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
  }

  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  saveSiswa(appState.students.find(s => s.nama === newNama));
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
  document.getElementById('promosiCalonSppInput').value = '';
  document.getElementById('promosiCalonBtn').onclick = () => _doPromoteSingle(nama);
  document.getElementById('promosiCalonModal').classList.add('open');
}

async function _doPromoteSingle(nama) {
  const idx = appState.students.findIndex(s => s.nama === nama);
  if (idx < 0) return;
  const spp = Number(document.getElementById('promosiCalonSppInput').value) || 0;
  appState.students[idx].status_kelulusan = '';
  appState.students[idx].spp = spp;
  appState.students[idx].spp_paid_months = [];
  appState.students[idx].spp_history = {};
  spmbSelectedRows.delete(nama);
  document.getElementById('promosiCalonModal').classList.remove('open');
  await saveSiswa(appState.students[idx]);
  renderSpmbPage();
  renderSiswaTable();
  renderDashboard();
  toast(`🎓 ${nama} berhasil dipromosikan ke Kelas ${appState.students[idx].kelas}!`);
}

function promoteSelectedCalon() {
  if (!spmbSelectedRows.size) return;
  const names = [...spmbSelectedRows];
  document.getElementById('promosiMassalCount').textContent = names.length;
  document.getElementById('promosiMassalNames').textContent =
    names.slice(0, 5).join(', ') + (names.length > 5 ? ` dan ${names.length - 5} lainnya` : '');
  document.getElementById('promosiMassalSppInput').value = '';
  document.getElementById('promosiMassalBtn').onclick = () => _doPromoteMassal(names);
  document.getElementById('promosiMassalModal').classList.add('open');
}

async function _doPromoteMassal(names) {
  const spp = Number(document.getElementById('promosiMassalSppInput').value) || 0;
  const updated = [];
  names.forEach(nama => {
    const idx = appState.students.findIndex(s => s.nama === nama);
    if (idx < 0) return;
    appState.students[idx].status_kelulusan = '';
    appState.students[idx].spp = spp;
    appState.students[idx].spp_paid_months = [];
    appState.students[idx].spp_history = {};
    updated.push(appState.students[idx]);
    spmbSelectedRows.delete(nama);
  });
  document.getElementById('promosiMassalModal').classList.remove('open');
  clearSpmbSelection();
  await Promise.all(updated.map(s => saveSiswa(s)));
  renderSpmbPage();
  renderSiswaTable();
  renderDashboard();
  toast(`🎓 ${updated.length} calon santri berhasil dipromosikan!`);
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
    if (typeof XLSX !== 'undefined') {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          _parseSpmbRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
        } catch(err) { toast('⚠️ Gagal membaca file: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast('⚠️ Library Excel belum siap. Gunakan format CSV.');
    }
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
    const uang_pendaftaran = Number(String(findKey(row, ['UANG_PENDAFTARAN','PENDAFTARAN','UANG PENDAFTARAN']) || '0').replace(/[^0-9]/g,'')) || 0;
    const pangkal = Number(String(findKey(row, ['PANGKAL','UANG_PANGKAL','UANG PANGKAL']) || '0').replace(/[^0-9]/g,'')) || 0;
    spmbImportBuffer.push({ nama, kelas, nisn, uang_pendaftaran, pangkal });
  });

  if (!spmbImportBuffer.length) { toast('⚠️ Tidak ada data valid di file'); return; }

  document.getElementById('spmbImportPreview').innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--primary);margin-bottom:10px;">
      ✅ ${spmbImportBuffer.length} calon santri siap diimport:
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>NISN</th><th>Uang Pendaftaran</th><th>Pangkal</th></tr></thead>
        <tbody>
          ${spmbImportBuffer.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${s.nama}</strong></td>
              <td>${s.kelas}</td>
              <td>${s.nisn || '—'}</td>
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
  spmbImportBuffer.forEach(row => {
    if (appState.students.find(s => s.nama === row.nama)) { dilewati++; return; }
    appState.students.push({
      nama: row.nama, kelas: row.kelas, nisn: row.nisn,
      spp: 0, spp_paid_months: [], spp_history: {},
      pangkal: row.pangkal, pangkal_paid: 0,
      uang_pendaftaran: row.uang_pendaftaran, uang_pendaftaran_paid: 0,
      status_kelulusan: 'calon',
    });
    ditambah++;
  });
  appState.students.sort((a, b) => a.nama.localeCompare(b.nama));
  document.getElementById('importCalonModal').classList.remove('open');
  spmbImportBuffer = [];
  await saveState();
  renderSpmbPage();
  toast(`✅ Import: ${ditambah} ditambahkan${dilewati ? ', ' + dilewati + ' dilewati (nama duplikat)' : ''}`);
}

function downloadTemplateCalonExcel() {
  if (typeof XLSX !== 'undefined') {
    const headers = ['NAMA', 'KELAS', 'NISN', 'UANG_PENDAFTARAN', 'PANGKAL'];
    const ex1 = ['AHMAD FAUZI', '7', '1234567890', 500000, 3000000];
    const ex2 = ['SITI AMINAH', '7', '', 500000, 3000000];
    const ex3 = ['BUDI SANTOSO', '8', '', 500000, 0];
    const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3]);
    ws['!cols'] = [{wch:30},{wch:8},{wch:14},{wch:18},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calon Santri SPMB');
    XLSX.writeFile(wb, 'template_import_calon_spmb.xlsx');
    toast('📋 Template Excel berhasil didownload');
  } else {
    const csv = `NAMA,KELAS,NISN,UANG_PENDAFTARAN,PANGKAL\nAHMAD FAUZI,7,1234567890,500000,3000000\nSITI AMINAH,7,,500000,3000000\n`;
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
