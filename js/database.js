// ── SiPay · Database Layer (Supabase) ──

// ══ STUDENTS ══
function _buildStudentRow(s) {
  return {
    nama: s.nama,
    kelas: s.kelas,
    nisn: s.nisn || '',
    spp: s.spp || 0,
    spp_paid_months: s.spp_paid_months || [],
    status_kelulusan: s.status_kelulusan || '',
  };
}

async function loadStudents() {
  const rows = await sb('students?select=*&order=nama');
  return rows.map(r => ({
    nama: r.nama,
    kelas: r.kelas,
    nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    status_kelulusan: r.status_kelulusan || '',
  }));
}

async function saveSiswa(s) {
  if (!s) return;
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?on_conflict=nama', 'POST', [_buildStudentRow(s)],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    console.error('saveSiswa error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// Rename santri: update baris yang sudah ada (bukan insert baru) + ikut ganti
// nama di tagihan & transaksi agar tidak jadi record yatim / duplikat.
async function renameStudentInDB(origNama, s) {
  if (!s || origNama === s.nama) return saveSiswa(s);
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      _buildStudentRow(s), { 'Prefer': 'return=minimal' });
    await sb('tagihan?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      { nama: s.nama }, { 'Prefer': 'return=minimal' }).catch(e => console.error('rename tagihan:', e));
    await sb('transactions?nama=eq.' + encodeURIComponent(origNama), 'PATCH',
      { nama: s.nama }, { 'Prefer': 'return=minimal' }).catch(e => console.error('rename transactions:', e));
    // Sinkron nama tagihan di memori
    appState.tagihan.forEach(t => { if (t.nama === origNama) t.nama = s.nama; });
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    console.error('renameStudentInDB error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

async function saveState() {
  showSyncIndicator('💾 Menyimpan...');
  try {
    const rows = appState.students.map(_buildStudentRow);
    await sb('students?on_conflict=nama', 'POST', rows,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch(e) {
    console.error('saveState error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

async function deleteStudentFromDB(nama) {
  try {
    await sb('students?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('deleteStudentFromDB error:', e); }
}

async function deleteTransactionsByNama(nama) {
  try {
    await sb('transactions?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('deleteTransactionsByNama error:', e); }
}

// ══ TAGIHAN ══
async function loadTagihan() {
  const rows = await sb('tagihan?select=*&order=created_at');
  return rows.map(r => ({
    id: r.id,
    nama: r.nama,
    kelas: r.kelas,
    item_id: r.item_id,
    item_name: r.item_name,
    nominal: Number(r.nominal) || 0,
    paid_amount: Number(r.paid_amount) || 0,
  }));
}

// Buat tagihan untuk satu siswa baru (item tetap aktif yg sesuai kelas).
// Item per-siswa (pangkal/pendaftaran) dikecualikan: nominalnya diatur lewat
// form Data Siswa / SPMB.
async function createTagihanForStudent(student) {
  const items = appState.payItems.filter(i =>
    i.active && i.type === 'tetap' && !PER_STUDENT_ITEMS.includes(i.id) &&
    (i.kelas || []).includes(student.kelas) &&
    !appState.tagihan.find(t => t.nama === student.nama && t.item_id === i.id)
  );
  if (!items.length) return;
  const records = items.map(i => ({
    nama: student.nama, kelas: student.kelas,
    item_id: i.id, item_name: i.name,
    nominal: i.amount || 0, paid_amount: 0,
  }));
  const res = await sb('tagihan', 'POST', records, { 'Prefer': 'return=representation' });
  if (Array.isArray(res)) {
    res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
}

// Buat tagihan untuk semua siswa aktif saat item diaktifkan.
// Item per-siswa (pangkal/pendaftaran) dikecualikan (nominal per-siswa).
async function createTagihanForItem(item) {
  if (PER_STUDENT_ITEMS.includes(item.id)) return 0;
  const students = appState.students.filter(s =>
    !s.status_kelulusan &&
    (item.kelas || []).includes(s.kelas) &&
    !appState.tagihan.find(t => t.nama === s.nama && t.item_id === item.id)
  );
  if (!students.length) return 0;
  const records = students.map(s => ({
    nama: s.nama, kelas: s.kelas,
    item_id: item.id, item_name: item.name,
    nominal: item.amount || 0, paid_amount: 0,
  }));
  const res = await sb('tagihan', 'POST', records, { 'Prefer': 'return=representation' });
  if (Array.isArray(res)) {
    res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
  return students.length;
}

// Update paid_amount tagihan (sinkron dengan kuitansi)
async function updateTagihanPaid(tagihanId, newPaidAmount) {
  await sb('tagihan?id=eq.' + tagihanId, 'PATCH',
    { paid_amount: newPaidAmount }, { 'Prefer': 'return=minimal' });
  const idx = appState.tagihan.findIndex(t => t.id === tagihanId);
  if (idx >= 0) appState.tagihan[idx].paid_amount = newPaidAmount;
}

// Update nominal & paid_amount tagihan (admin edit manual)
async function updateTagihanNominal(tagihanId, nominal, paidAmount) {
  await sb('tagihan?id=eq.' + tagihanId, 'PATCH',
    { nominal, paid_amount: paidAmount }, { 'Prefer': 'return=minimal' });
  const idx = appState.tagihan.findIndex(t => t.id === tagihanId);
  if (idx >= 0) {
    appState.tagihan[idx].nominal     = nominal;
    appState.tagihan[idx].paid_amount = paidAmount;
  }
}

// Nominal tagihan item per-siswa saat ini (untuk prefill form). Generik.
function getStudentTagihanNominal(nama, itemId) {
  const t = findTagihan(nama, itemId);
  return t ? (t.nominal || 0) : 0;
}
function getPangkalNominal(nama)      { return getStudentTagihanNominal(nama, 'pangkal'); }
function getPendaftaranNominal(nama)  { return getStudentTagihanNominal(nama, 'pendaftaran'); }

// Set/buat nominal tagihan item per-siswa (acuan dari form Data Siswa / SPMB).
// paid_amount dipertahankan. nominal<=0 tanpa tagihan → tak membuat apa-apa.
async function upsertStudentTagihan(student, itemId, nominal) {
  const val = Math.max(0, Number(nominal) || 0);
  const existing = findTagihan(student.nama, itemId);
  if (existing) {
    if ((existing.nominal || 0) === val) return;
    await updateTagihanNominal(existing.id, val, existing.paid_amount || 0);
    return;
  }
  if (val <= 0) return;
  const item = appState.payItems.find(i => i.id === itemId);
  const rec = {
    nama: student.nama, kelas: student.kelas,
    item_id: itemId, item_name: item ? item.name : itemId,
    nominal: val, paid_amount: 0,
  };
  const res = await sb('tagihan', 'POST', [rec], { 'Prefer': 'return=representation' });
  if (Array.isArray(res) && res[0]) {
    appState.tagihan.push({
      id: res[0].id, nama: res[0].nama, kelas: res[0].kelas,
      item_id: res[0].item_id, item_name: res[0].item_name,
      nominal: Number(res[0].nominal) || 0, paid_amount: Number(res[0].paid_amount) || 0,
    });
  }
}
function upsertPangkalTagihan(student, nominal)     { return upsertStudentTagihan(student, 'pangkal', nominal); }
function upsertPendaftaranTagihan(student, nominal) { return upsertStudentTagihan(student, 'pendaftaran', nominal); }

// Perbarui nominal SEMUA tagihan satu item (saat admin ubah nominal item).
// paid_amount tiap santri dipertahankan; sisa dihitung ulang dari nominal baru.
async function updateTagihanNominalByItem(itemId, newNominal) {
  const rows = appState.tagihan.filter(t => t.item_id === itemId);
  if (!rows.length) return 0;
  await sb('tagihan?item_id=eq.' + encodeURIComponent(itemId), 'PATCH',
    { nominal: newNominal }, { 'Prefer': 'return=minimal' });
  rows.forEach(t => { t.nominal = newNominal; });
  return rows.length;
}

// Hapus semua tagihan satu item (saat admin pilih "hapus record")
async function deleteTagihanByItemId(itemId) {
  await sb('tagihan?item_id=eq.' + encodeURIComponent(itemId), 'DELETE', null, { 'Prefer': 'return=minimal' });
  appState.tagihan = appState.tagihan.filter(t => t.item_id !== itemId);
}

// Hapus semua tagihan satu siswa (saat siswa dihapus)
async function deleteTagihanByNama(nama) {
  try {
    await sb('tagihan?nama=eq.' + encodeURIComponent(nama), 'DELETE', null, { 'Prefer': 'return=minimal' });
    appState.tagihan = appState.tagihan.filter(t => t.nama !== nama);
  } catch(e) { console.error('deleteTagihanByNama error:', e); }
}

// Helper: cari tagihan siswa untuk satu item
function findTagihan(nama, itemId) {
  return appState.tagihan.find(t => t.nama === nama && t.item_id === itemId) || null;
}

// ══ TRANSACTIONS ══
async function loadTransactions() {
  const rows = await sb('transactions?select=*&order=created_at');
  return rows.map(r => ({
    nama: r.nama, kelas: r.kelas, jenis: r.jenis,
    nominal: Number(r.nominal) || 0, time: r.time, catatan: r.catatan || '',
  }));
}

async function saveTransaction(t) {
  try {
    await sb('transactions', 'POST', {
      nama: t.nama, kelas: t.kelas, jenis: t.jenis,
      nominal: t.nominal || 0, time: t.time, catatan: t.catatan || '',
    }, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('saveTransaction error:', e); }
}

// ══ SETTINGS ══
async function loadSettings() {
  try {
    const rows = await sb('settings?select=*');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    if (Array.isArray(map.payItems) && map.payItems.length) appState.payItems = map.payItems;
    if (map.profil && Object.keys(map.profil).length)
      localStorage.setItem('sipay_profil', JSON.stringify(map.profil));
    if (map.logo)
      localStorage.setItem('sipay_logo', map.logo);
    if (map.akun && map.akun.user) {
      // Password tidak lagi disimpan di settings (dikelola Supabase Auth).
      const cleanAkun = { user: map.akun.user, email: map.akun.email || '', hp: map.akun.hp || '' };
      localStorage.setItem('sipay_akun', JSON.stringify(cleanAkun));
      localStorage.setItem('sipay_admin', JSON.stringify({ user: cleanAkun.user }));
    }
  } catch(e) { console.error('loadSettings error:', e); }
}

async function saveSettings() {
  const profil  = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const akunRaw = JSON.parse(localStorage.getItem('sipay_akun')   || '{}');
  // Jangan pernah menulis password ke settings (dibaca anon). Simpan hanya kontak.
  const akun    = { user: akunRaw.user || 'Admin', email: akunRaw.email || '', hp: akunRaw.hp || '' };
  const logo    = localStorage.getItem('sipay_logo') || '';
  try {
    const records = [
      { key: 'payItems', value: appState.payItems },
      { key: 'profil',   value: profil },
      { key: 'akun',     value: akun },
    ];
    if (logo) records.push({ key: 'logo', value: logo });
    await sb('settings?on_conflict=key', 'POST', records,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) { console.error('saveSettings error:', e); }
}

// ── Load semua data ──
async function loadDataForTA() {
  showSyncIndicator('⏳ Memuat data...');
  try {
    const [students, transactions, tagihan] = await Promise.all([
      loadStudents(), loadTransactions(), loadTagihan()
    ]);
    appState.students     = students;
    appState.transactions = transactions;
    appState.tagihan      = tagihan;
    try {
      localStorage.setItem('sipay_state', JSON.stringify({
        students: appState.students,
        transactions: appState.transactions,
        tagihan: appState.tagihan,
        payItems: appState.payItems,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* quota exceeded */ }
    showSyncIndicator('✅ Data dimuat', 2000);
    const gi = document.getElementById('gasIcon'); if(gi) gi.textContent='🟢';
    const gl = document.getElementById('gasLabel'); if(gl) gl.textContent='Terhubung';
    const syncEl = document.getElementById('lastSyncTime');
    if (syncEl) syncEl.textContent = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  } catch(e) {
    showSyncIndicator('⚠️ Gagal memuat', 3000);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.textContent='🔴';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    throw e;
  }
  renderDashboard();
  renderSiswaTable();
  renderTunggakan();
  const sel = document.getElementById('cetakNama');
  if (sel) sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s => `<option value="${esc(s.nama)}">${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('');
}

async function initApp() {
  showSyncIndicator('⏳ Memuat data...');
  try { await loadSettings(); } catch(e) { console.error('loadSettings error:', e); }
  // Pastikan item baku (SPP/Pangkal/Pendaftaran) ada; persist bila admin login.
  if (ensureBakuItems() && hasAdminSession()) saveSettings().catch(() => {});
  try {
    await loadDataForTA();
  } catch(e) {
    console.error('loadDataForTA error:', e);
    showSyncIndicator('⚠️ Offline — pakai data lokal', 3000);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.textContent='🔴';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    const saved = JSON.parse(localStorage.getItem('sipay_state') || 'null');
    if (saved?.students)         appState.students     = saved.students;
    if (saved?.transactions)     appState.transactions = saved.transactions;
    if (saved?.tagihan)          appState.tagihan      = saved.tagihan;
    if (saved?.payItems?.length) appState.payItems     = saved.payItems;
  }
  renderDashboard();
  renderSiswaTable();
  renderTunggakan();
  loadTemplateKuitansi().catch(()=>{});
  const sel = document.getElementById('cetakNama');
  if (sel) sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s => `<option value="${esc(s.nama)}">${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('');
  const t1 = document.getElementById('cetakTanggal');
  const t2 = document.getElementById('cetakTanggalTotal');
  if (t1) t1.value = new Date().toISOString().split('T')[0];
  if (t2) t2.value = new Date().toISOString().split('T')[0];
}
