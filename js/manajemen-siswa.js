// ── SiPay · Manajemen Siswa (Tambah/Edit/Hapus/Bulk) ──
// KELAS CHIP FILTER
// ══════════════════════════════════════════
let activeKelasFilter = '';
function setKelasChip(el) {
  document.querySelectorAll('#kelasChips .kchip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  activeKelasFilter = el.dataset.kelas;
  renderSiswaTable();
}

// ══════════════════════════════════════════
// BULK SELECTION
// ══════════════════════════════════════════
let selectedRows = new Set();
function toggleSelectAll(chk) {
  const allChks = document.querySelectorAll('#siswaTable tbody .row-chk');
  allChks.forEach(c => {
    c.checked = chk.checked;
    const nama = c.dataset.nama;
    if (chk.checked) selectedRows.add(nama); else selectedRows.delete(nama);
  });
  updateBulkBar();
}
function toggleRowSelect(chk) {
  if (chk.checked) selectedRows.add(chk.dataset.nama);
  else selectedRows.delete(chk.dataset.nama);
  const allChks = document.querySelectorAll('#siswaTable tbody .row-chk');
  document.getElementById('chkAll').checked = allChks.length > 0 && [...allChks].every(c => c.checked);
  updateBulkBar();
}
function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  if (selectedRows.size > 0) {
    bar.classList.add('show');
    document.getElementById('bulkCount').textContent = selectedRows.size + ' santri dipilih';
  } else {
    bar.classList.remove('show');
  }
}
function clearSelection() {
  selectedRows.clear();
  document.querySelectorAll('.row-chk').forEach(c => c.checked = false);
  const ca = document.getElementById('chkAll');
  if (ca) ca.checked = false;
  updateBulkBar();
}
function deleteSelected() {
  if (!selectedRows.size) return;
  const names = [...selectedRows];
  document.getElementById('deleteMsg').textContent = `Anda akan menghapus ${names.length} santri: ${names.slice(0,3).join(', ')}${names.length>3?' dan '+(names.length-3)+' lainnya':''}. Data pembayaran mereka juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => !selectedRows.has(s.nama));
    appState.transactions = appState.transactions.filter(t => !selectedRows.has(t.nama));
    selectedRows.clear(); updateBulkBar();
    document.getElementById('deleteModal').classList.remove('open');
    renderSiswaTable();
    toast(`🗑️ ${names.length} santri berhasil dihapus`);
    await Promise.all(names.map(n => deleteStudentFromDB(n)));
  };
  document.getElementById('deleteModal').classList.add('open');
}
function deleteSingle(nama) {
  document.getElementById('deleteMsg').textContent = `Hapus data santri "${nama}"? Seluruh data pembayaran santri ini juga akan dihapus.`;
  document.getElementById('deleteConfirmBtn').onclick = async function() {
    appState.students = appState.students.filter(s => s.nama !== nama);
    appState.transactions = appState.transactions.filter(t => t.nama !== nama);
    document.getElementById('deleteModal').classList.remove('open');
    renderSiswaTable();
    toast(`🗑️ ${nama} berhasil dihapus`);
    await deleteStudentFromDB(nama);
  };
  document.getElementById('deleteModal').classList.add('open');
}
// [dipindah ke DOMContentLoaded]

// ══════════════════════════════════════════
// ADD SISWA
// ══════════════════════════════════════════
function openTambahChoice() {
  document.getElementById('tambahChoiceModal').classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tambahChoiceModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

function openAddSiswaModal() {
  document.getElementById('tambahChoiceModal').classList.remove('open');
  ['ns_nama','ns_nisn','ns_spp','ns_pangkal','ns_pangkal_paid'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ns_kelas').value = '';
  document.querySelectorAll('#ns_months_wrap input[type=checkbox]').forEach(c => c.checked = false);
  const taInput = document.getElementById('ns_ta');
  if (taInput) taInput.value = getProfil().ta || '';
  document.getElementById('addSiswaModal').classList.add('open');
}
// Return TA terbaru dari spp_history siswa (string "YYYY/YYYY" atau '')
function getLatestTA(siswa) {
  const keys = Object.keys(siswa.spp_history || {});
  if (!keys.length) return '';
  return keys.sort((a, b) => parseInt(b.split('/')[0]) - parseInt(a.split('/')[0]))[0];
}

// Update kolom utama siswa dari entry TA terbaru di spp_history
function updateKolomUtamaDariHistory(siswa) {
  const ta = getLatestTA(siswa);
  if (!ta) return siswa;
  const d = siswa.spp_history[ta];
  siswa.kelas           = d.kelas           || siswa.kelas;
  siswa.spp             = d.spp             || 0;
  siswa.pangkal         = d.pangkal         || 0;
  siswa.pangkal_paid    = d.pangkal_paid    || 0;
  siswa.spp_paid_months = d.spp_paid_months || [];
  return siswa;
}

// Cari index siswa yang cocok berdasarkan NISN → nama eksak → fuzzy
// Return index di appState.students, atau -1 jika tidak ditemukan
function findExistingSiswaIdx(kandidat) {
  const students = appState.students;
  if (kandidat.nisn && kandidat.nisn.trim()) {
    const idx = students.findIndex(s => s.nisn && s.nisn.trim() === kandidat.nisn.trim());
    if (idx >= 0) return idx;
  }
  const normK = normNama(kandidat.nama);
  const idx2 = students.findIndex(s => normNama(s.nama) === normK);
  if (idx2 >= 0) return idx2;
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (!kandidat.nisn || !s.nisn) {
      if (nameSimilarity(kandidat.nama, s.nama) >= 0.85) return i;
    }
  }
  return -1;
}

// Merge data baru ke data lama untuk TA tertentu, lalu update kolom utama dari TA terbaru
function mergeSiswaData(lama, baru, ta) {
  const history = { ...(lama.spp_history || {}) };
  if (ta) {
    const ex = history[ta] || {};
    history[ta] = {
      kelas:           baru.kelas || ex.kelas || lama.kelas,
      spp:             (baru.spp > 0) ? baru.spp : (ex.spp || 0),
      pangkal:         Math.max(ex.pangkal || 0, baru.pangkal || 0),
      pangkal_paid:    Math.max(ex.pangkal_paid || 0, baru.pangkal_paid || 0),
      spp_paid_months: [...new Set([...(ex.spp_paid_months || []), ...(baru.spp_paid_months || [])])],
    };
  }
  const merged = {
    ...lama,
    nisn:        (baru.nisn && baru.nisn.trim()) ? baru.nisn.trim() : (lama.nisn || ''),
    spp_history: history,
  };
  return updateKolomUtamaDariHistory(merged);
}

function saveNewSiswa() {
  const nama = document.getElementById('ns_nama').value.trim().toUpperCase();
  const kelas = document.getElementById('ns_kelas').value;
  if (!nama) { toast('⚠️ Nama santri wajib diisi!'); return; }
  if (!kelas) { toast('⚠️ Kelas wajib dipilih!'); return; }

  const ta          = (document.getElementById('ns_ta')?.value.trim()) || getProfil().ta || '';
  const paid_months = [...document.querySelectorAll('#ns_months_wrap input[type=checkbox]:checked')].map(c => c.value);
  const spp         = Number(document.getElementById('ns_spp').value) || 0;
  const pangkal     = Number(document.getElementById('ns_pangkal').value) || 0;
  const pangkal_paid = Number(document.getElementById('ns_pangkal_paid').value) || 0;

  const newSiswa = {
    nama, kelas,
    nisn: document.getElementById('ns_nisn').value.trim(),
    spp, spp_paid_months: paid_months, pangkal, pangkal_paid,
    spp_history: ta ? { [ta]: { kelas, spp, pangkal, pangkal_paid, spp_paid_months: paid_months } } : {},
  };

  const existIdx = findExistingSiswaIdx(newSiswa);
  if (existIdx >= 0) {
    const merged = mergeSiswaData(appState.students[existIdx], newSiswa, ta);
    appState.students[existIdx] = merged;
    const ai = allStudentsAllTA.findIndex(r => r.nama === merged.nama);
    if (ai >= 0) allStudentsAllTA[ai] = { ...merged };
    appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
    saveSiswa(merged);
    document.getElementById('addSiswaModal').classList.remove('open');
    renderSiswaTable(); renderTunggakan(); renderDashboard();
    toast(`🔄 Data ${merged.nama} diperbarui & digabung!`);
    return;
  }

  appState.students.push(newSiswa);
  allStudentsAllTA.push({ ...newSiswa });
  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
  saveSiswa(newSiswa);
  document.getElementById('addSiswaModal').classList.remove('open');
  renderSiswaTable(); renderTunggakan(); renderDashboard();
  toast(`✅ ${nama} berhasil ditambahkan!`);
}
// [dipindah ke DOMContentLoaded]


// ══════════════════════════════════════════
// EDIT SISWA
// ══════════════════════════════════════════
function openEditPembayaran(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('ep_nama').value = nama;
  document.getElementById('ep_namaLabel').textContent = nama + ' — Kelas ' + s.kelas;
  document.getElementById('ep_pangkal').value = s.pangkal || '';
  document.getElementById('ep_pangkal_paid').value = s.pangkal_paid || '';
  document.querySelectorAll('#ep_months_wrap input[type=checkbox]').forEach(c => {
    c.checked = (s.spp_paid_months || []).includes(c.value);
  });
  updateEpPangkalInfo();
  document.getElementById('editPembayaranModal').classList.add('open');
}

function updateEpPangkalInfo() {
  const pangkal = Number(document.getElementById('ep_pangkal').value) || 0;
  const paid    = Number(document.getElementById('ep_pangkal_paid').value) || 0;
  const sisa    = Math.max(0, pangkal - paid);
  const el = document.getElementById('ep_pangkal_info');
  if (!el) return;
  if (!pangkal) { el.textContent = '—'; return; }
  el.innerHTML = sisa <= 0
    ? `<span style="color:var(--primary-light);font-weight:600;">✅ Lunas (${rp(pangkal)})</span>`
    : `Sisa: <strong style="color:var(--danger);">${rp(sisa)}</strong> dari total ${rp(pangkal)}`;
}

function saveEditPembayaran() {
  const nama = document.getElementById('ep_nama').value;
  const idx  = appState.students.findIndex(s => s.nama === nama);
  if (idx < 0) { toast('⚠️ Data tidak ditemukan'); return; }

  const pangkal      = Number(document.getElementById('ep_pangkal').value) || 0;
  const pangkal_paid = Number(document.getElementById('ep_pangkal_paid').value) || 0;
  const paid_months  = [...document.querySelectorAll('#ep_months_wrap input[type=checkbox]:checked')].map(c => c.value);

  appState.students[idx].pangkal       = pangkal;
  appState.students[idx].pangkal_paid  = pangkal_paid;
  appState.students[idx].spp_paid_months = paid_months;

  // Sync ke allStudentsAllTA
  const ai = allStudentsAllTA.findIndex(r =>
    r.nama === nama
  );
  if (ai >= 0) {
    allStudentsAllTA[ai].pangkal       = pangkal;
    allStudentsAllTA[ai].pangkal_paid  = pangkal_paid;
    allStudentsAllTA[ai].spp_paid_months = paid_months;
  }

  saveSiswa(appState.students[idx]);
  document.getElementById('editPembayaranModal').classList.remove('open');

  // Refresh semua tampilan
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();

  // Re-render detail tunggakan jika masih terbuka
  const detailEl = document.getElementById('tunggakanDetail');
  if (detailEl?.innerHTML) selectTunggakanStudent(nama);

  toast(`✅ Data pembayaran ${nama} berhasil diperbarui!`);
}

function openEditSiswa(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('ed_original_nama').value = s.nama;
  document.getElementById('ed_nama').value = s.nama;
  document.getElementById('ed_nisn').value = s.nisn || '';
  document.getElementById('ed_kelas').value = s.kelas;
  document.getElementById('ed_spp').value = s.spp || '';
  document.getElementById('ed_pangkal').value = s.pangkal || '';
  document.getElementById('editSiswaModal').classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('editSiswaModal').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
});

function saveEditSiswa() {
  const origNama = document.getElementById('ed_original_nama').value;
  const newNama = document.getElementById('ed_nama').value.trim().toUpperCase();
  const kelas   = document.getElementById('ed_kelas').value;
  if (!newNama) { toast('⚠️ Nama santri wajib diisi!'); return; }
  if (!kelas)   { toast('⚠️ Kelas wajib dipilih!'); return; }
  // Cek duplikat nama (kecuali nama sendiri)
  if (newNama !== origNama && appState.students.find(s => s.nama === newNama)) {
    toast('⚠️ Nama santri sudah ada!'); return;
  }
  const idx = appState.students.findIndex(s => s.nama === origNama);
  if (idx < 0) { toast('⚠️ Data tidak ditemukan!'); return; }

  const oldData = appState.students[idx];

  // Simpan semua field — pertahankan spp_paid_months & pangkal_paid dari data lama
  // (field ini sekarang dikelola di menu Tunggakan)
  appState.students[idx] = {
    nama:             newNama,
    kelas,
    nisn:             document.getElementById('ed_nisn').value.trim(),
    spp:              Number(document.getElementById('ed_spp').value) || 0,
    pangkal:          Number(document.getElementById('ed_pangkal').value) || 0,
    pangkal_paid:     oldData.pangkal_paid || 0,
    spp_paid_months:  oldData.spp_paid_months || [],
  };

  // Update nama di transactions jika berubah
  if (newNama !== origNama) {
    appState.transactions.forEach(t => { if (t.nama === origNama) t.nama = newNama; });
  }

  // Sync ke allStudentsAllTA
  const ai = allStudentsAllTA.findIndex(r =>
    r.nama === origNama
  );
  if (ai >= 0) {
    allStudentsAllTA[ai] = { ...allStudentsAllTA[ai], ...appState.students[idx] };
  }

  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
  saveSiswa(appState.students[idx]);
  document.getElementById('editSiswaModal').classList.remove('open');

  // Refresh semua tampilan terkait
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();

  toast(`✅ Data ${newNama} berhasil diperbarui!`);
}

// ══════════════════════════════════════════
// IMPORT WIZARD STEPS
