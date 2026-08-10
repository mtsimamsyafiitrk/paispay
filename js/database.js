// ── SiPay · Database Layer (Supabase) ──

// ── Ambil SEMUA baris dengan paginasi ──
// Supabase membatasi jumlah baris per respons API (bawaan: 1000 — lihat
// Dashboard → Settings → API → "Max rows"). Tanpa paginasi, sekolah dengan
// lebih dari 1000 baris tagihan/transaksi akan diam-diam kehilangan sisanya:
// tagihan sebagian santri terlihat KOSONG padahal datanya ada di database.
// Batas ini tidak memunculkan error apa pun — datanya hanya terpotong.
//
// path WAJIB memakai order yang stabil (sertakan kolom unik sebagai pemecah
// seri), kalau tidak ada baris yang bisa terlewat/terhitung dua kali.
async function sbAll(path, pageSize = 1000) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await sb(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

// ══ STUDENTS ══
// Kompatibilitas mundur: kolom spp_history mungkin belum ada bila migrasi
// (supabase_migration_spp_history.sql) belum dijalankan. Bila server menolak
// karena kolom itu tidak ada, flag ini dimatikan agar penyimpanan tetap jalan
// (tanpa riwayat SPP tahun lalu) sampai migrasi dijalankan.
let _sppHistorySupported = true;

function _buildStudentRow(s) {
  const row = {
    nama: s.nama,
    kelas: s.kelas,
    nisn: s.nisn || '',
    spp: s.spp || 0,
    spp_paid_months: s.spp_paid_months || [],
    status_kelulusan: s.status_kelulusan || '',
  };
  if (_sppHistorySupported) {
    row.spp_history = (s.spp_history && typeof s.spp_history === 'object' && !Array.isArray(s.spp_history)) ? s.spp_history : {};
  }
  return row;
}

// Deteksi error "kolom spp_history belum ada" (PostgREST / schema cache).
function _isMissingSppHistory(e) {
  const msg = String((e && e.message) || e || '');
  return /spp_history/.test(msg);
}

// Kompatibilitas mundur untuk metadata pembayaran (metode / dibayar_oleh /
// tgl_bayar). Bila migrasi supabase_migration_payment_meta.sql belum dijalankan,
// kolom-kolom ini belum ada; flag dimatikan agar simpan tetap jalan tanpa metadata.
let _paymentMetaSupported = true;
function _isMissingPaymentMeta(e) {
  const msg = String((e && e.message) || e || '');
  return /metode|dibayar_oleh|tgl_bayar/.test(msg);
}

// Insert kuitansi dengan fallback bila kolom metadata pembayaran belum ada.
async function insertKuitansi(kwtData) {
  const strip = (o) => { const c = { ...o }; delete c.metode; delete c.dibayar_oleh; delete c.tgl_bayar; return c; };
  const payload = _paymentMetaSupported ? kwtData : strip(kwtData);
  try {
    return await sb('kuitansi', 'POST', payload, { 'Prefer': 'return=representation' });
  } catch(e) {
    if (_paymentMetaSupported && _isMissingPaymentMeta(e)) {
      _paymentMetaSupported = false;
      return await sb('kuitansi', 'POST', strip(kwtData), { 'Prefer': 'return=representation' });
    }
    throw e;
  }
}

async function loadStudents() {
  const rows = await sbAll('students?select=*&order=nama.asc,id.asc');
  return rows.map(r => ({
    nama: r.nama,
    kelas: r.kelas,
    nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    spp_history: (r.spp_history && typeof r.spp_history === 'object' && !Array.isArray(r.spp_history)) ? r.spp_history : {},
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
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return saveSiswa(s); // ulangi tanpa kolom spp_history
    }
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
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return renameStudentInDB(origNama, s); // ulangi tanpa kolom spp_history
    }
    console.error('renameStudentInDB error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// PERINGATAN: saveState() mengirim SELURUH appState.students. Bila salinan di
// memori sudah usang (device lain menyimpan lebih dulu), datanya ikut tertimpa.
// Untuk operasi massal pakai saveStudentsBatch(daftarYangDisentuh) saja.
async function saveState() {
  showSyncIndicator('💾 Menyimpan...');
  try {
    const rows = appState.students.map(_buildStudentRow);
    await sb('students?on_conflict=nama', 'POST', rows,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch(e) {
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return saveState(); // ulangi tanpa kolom spp_history
    }
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
  const rows = await sbAll('tagihan?select=*&order=created_at.asc,id.asc');
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

// Simpan banyak tagihan sekaligus (dipakai Import Tunggakan).
// rows: array { id?, nama, kelas, item_id, item_name, nominal, paid_amount }.
// Baris ber-id = memperbarui record lama (upsert lewat primary key), baris tanpa
// id = record baru. Keduanya dikirim terpisah karena PostgREST memakai satu
// daftar kolom untuk seluruh batch (id null akan melanggar primary key).
async function upsertTagihanBatch(rows) {
  const toRow = r => ({
    nama: r.nama, kelas: r.kelas || '', item_id: r.item_id, item_name: r.item_name,
    nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
  });
  const baru = rows.filter(r => !r.id);
  const lama = rows.filter(r => r.id);

  if (lama.length) {
    await sb('tagihan?on_conflict=id', 'POST', lama.map(r => ({ id: r.id, ...toRow(r) })),
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    lama.forEach(r => {
      const t = appState.tagihan.find(x => x.id === r.id);
      if (t) { t.nominal = Number(r.nominal) || 0; t.paid_amount = Number(r.paid_amount) || 0; t.kelas = r.kelas || t.kelas; }
    });
  }
  if (baru.length) {
    const res = await sb('tagihan', 'POST', baru.map(toRow), { 'Prefer': 'return=representation' });
    if (Array.isArray(res)) res.forEach(r => appState.tagihan.push({
      id: r.id, nama: r.nama, kelas: r.kelas,
      item_id: r.item_id, item_name: r.item_name,
      nominal: Number(r.nominal) || 0, paid_amount: Number(r.paid_amount) || 0,
    }));
  }
  return rows.length;
}

// Upsert banyak siswa sekaligus tanpa mengirim seluruh appState.students
// (saveState mengirim semuanya; ini dipakai import agar payload tetap kecil).
async function saveStudentsBatch(list) {
  if (!list || !list.length) return;
  try {
    await sb('students?on_conflict=nama', 'POST', list.map(_buildStudentRow),
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) {
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return saveStudentsBatch(list); // ulangi tanpa kolom spp_history
    }
    throw e;
  }
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
  const rows = await sbAll('transactions?select=*&order=created_at.asc,id.asc');
  return rows.map(r => ({
    nama: r.nama, kelas: r.kelas, jenis: r.jenis,
    nominal: Number(r.nominal) || 0, time: r.time, catatan: r.catatan || '',
    metode: r.metode || '', dibayar_oleh: r.dibayar_oleh || '',
  }));
}

async function saveTransaction(t) {
  const row = {
    nama: t.nama, kelas: t.kelas, jenis: t.jenis,
    nominal: t.nominal || 0, time: t.time, catatan: t.catatan || '',
  };
  if (_paymentMetaSupported) {
    row.metode = t.metode || '';
    row.dibayar_oleh = t.dibayar_oleh || '';
  }
  try {
    await sb('transactions', 'POST', row, { 'Prefer': 'return=minimal' });
  } catch(e) {
    if (_paymentMetaSupported && _isMissingPaymentMeta(e)) {
      _paymentMetaSupported = false;
      return saveTransaction(t); // ulangi tanpa kolom metadata pembayaran
    }
    console.error('saveTransaction error:', e);
  }
}

// ══ SETTINGS ══
// Penanda apakah settings sempat dibaca dari server pada sesi ini. Bila belum
// (mis. device baru yang gagal memuat), saveSettings TIDAK boleh mengirim
// profil/akun/logo dari localStorage yang masih kosong — kalau dikirim, profil
// madrasah yang sudah diisi di device lain ikut terhapus.
let _settingsLoaded = false;

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
    _settingsLoaded = true;
  } catch(e) { console.error('loadSettings error:', e); }
}

async function saveSettings() {
  const profil  = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const akunRaw = JSON.parse(localStorage.getItem('sipay_akun')   || '{}');
  // Jangan pernah menulis password ke settings (dibaca anon). Simpan hanya kontak.
  const akun    = { user: akunRaw.user || 'Admin', email: akunRaw.email || '', hp: akunRaw.hp || '' };
  const logo    = localStorage.getItem('sipay_logo') || '';
  try {
    const records = [{ key: 'payItems', value: appState.payItems }];
    // Hanya kirim profil/akun/logo bila memang ada isinya DAN settings server
    // sudah pernah terbaca — supaya device yang datanya belum tersinkron tidak
    // menimpa isian device lain dengan nilai kosong.
    if (_settingsLoaded && Object.keys(profil).length) records.push({ key: 'profil', value: profil });
    if (_settingsLoaded && akunRaw.user)              records.push({ key: 'akun',   value: akun });
    if (_settingsLoaded && logo)                      records.push({ key: 'logo',   value: logo });
    await sb('settings?on_conflict=key', 'POST', records,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) { console.error('saveSettings error:', e); }
}

// ══ SINKRONISASI LINTAS DEVICE ══
// Semua penulisan di bawah ini membaca kondisi TERBARU di server lebih dulu,
// lalu menggabungkannya dengan perubahan yang baru dibuat. Tanpa ini,
// salinan di memori device B (yang bisa saja sudah usang karena device A
// menyimpan lebih dulu) akan menimpa hasil input device A.

// Tandai bulan SPP yang baru lunas — hasil gabungan server + input baru.
//   months   : ['Jul','Agt']  → SPP tahun ajaran berjalan
//   histPaid : { '2024/2025': { rate: 100000, months: ['Jul'] } } → tunggakan TA lalu
async function commitSppPayment(nama, months = [], histPaid = {}) {
  const local = appState.students.find(s => s.nama === nama) || null;

  let server = null, serverOk = false;
  try {
    const sel = _sppHistorySupported ? 'spp_paid_months,spp_history' : 'spp_paid_months';
    const rows = await sb('students?select=' + sel + '&nama=eq.' + encodeURIComponent(nama));
    server = (rows && rows[0]) || null;
    serverOk = true;
  } catch(e) {
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return commitSppPayment(nama, months, histPaid);
    }
    console.error('commitSppPayment read:', e);
  }

  // Baris belum ada di server (santri baru yang gagal tersimpan) atau server
  // tak terbaca → pakai jalur simpan biasa agar pembayaran tidak hilang.
  if (!serverOk || !server) {
    if (local) {
      months.forEach(m => { if (!local.spp_paid_months.includes(m)) local.spp_paid_months.push(m); });
      Object.entries(histPaid).forEach(([ta, info]) => markSppHistPaid(local, ta, info.rate, info.months || []));
    }
    return saveSiswa(local);
  }

  const basePaid = Array.isArray(server.spp_paid_months)
    ? server.spp_paid_months
    : ((local && local.spp_paid_months) || []);
  const paid = [...new Set([...basePaid, ...months])];

  const srvHist = (server.spp_history && typeof server.spp_history === 'object' && !Array.isArray(server.spp_history))
    ? server.spp_history : {};
  const hist = JSON.parse(JSON.stringify(_sppHistorySupported ? srvHist : ((local && local.spp_history) || {})));
  // markSppHistPaid() bekerja pada objek bergaya siswa; bungkus riwayat server.
  const carrier = { spp_history: hist };
  Object.entries(histPaid).forEach(([ta, info]) => markSppHistPaid(carrier, ta, info.rate, info.months || []));

  const patch = { spp_paid_months: paid };
  if (_sppHistorySupported) patch.spp_history = carrier.spp_history;

  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb('students?nama=eq.' + encodeURIComponent(nama), 'PATCH', patch, { 'Prefer': 'return=minimal' });
    if (local) {
      local.spp_paid_months = paid;
      if (_sppHistorySupported) local.spp_history = carrier.spp_history;
    }
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    if (_sppHistorySupported && _isMissingSppHistory(e)) {
      _sppHistorySupported = false;
      return commitSppPayment(nama, months, histPaid);
    }
    console.error('commitSppPayment error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// Tambah pembayaran tagihan sebagai SELISIH (delta) di atas nilai terbaru di
// server, bukan menimpa dengan angka hasil hitungan lokal.
async function addTagihanPaid(tagihanId, delta) {
  const local = appState.tagihan.find(t => t.id === tagihanId) || null;
  let base = null;
  try {
    const rows = await sb('tagihan?select=paid_amount&id=eq.' + tagihanId);
    if (rows && rows[0]) base = Number(rows[0].paid_amount) || 0;
  } catch(e) { console.error('addTagihanPaid read:', e); }
  if (base == null) base = local ? (Number(local.paid_amount) || 0) : 0;
  return updateTagihanPaid(tagihanId, Math.max(0, base + (Number(delta) || 0)));
}

// Tambah/hapus bulan SPP terbayar di atas kondisi TERBARU server (dipakai alur
// hapus kuitansi & koreksi). Mengembalikan daftar bulan hasil akhir.
async function adjustSppPaidMonths(nama, add = [], remove = []) {
  const local = appState.students.find(s => s.nama === nama) || null;
  let base = null;
  try {
    const rows = await sb('students?select=spp_paid_months&nama=eq.' + encodeURIComponent(nama));
    if (rows && rows[0] && Array.isArray(rows[0].spp_paid_months)) base = rows[0].spp_paid_months;
  } catch(e) { console.error('adjustSppPaidMonths read:', e); }
  if (base == null) base = (local && local.spp_paid_months) || [];

  const months = [...new Set([...base, ...add])].filter(m => !remove.includes(m));
  await sb('students?nama=eq.' + encodeURIComponent(nama), 'PATCH',
    { spp_paid_months: months }, { 'Prefer': 'return=minimal' });
  if (local) local.spp_paid_months = months;
  return months;
}

// Ambil ulang satu santri + tagihannya dari server (dipakai saat santri dipilih
// di form Input Pembayaran, supaya bulan/tagihan yang baru dilunasi di device
// lain langsung terlihat). Return true bila ada perubahan.
async function refreshStudent(nama) {
  if (!nama) return false;
  let rows, tRows;
  try {
    [rows, tRows] = await Promise.all([
      sb('students?select=*&nama=eq.' + encodeURIComponent(nama)),
      sb('tagihan?select=*&nama=eq.' + encodeURIComponent(nama)),
    ]);
  } catch(e) { console.error('refreshStudent error:', e); return false; }
  if (!rows || !rows[0]) return false;

  const r = rows[0];
  const fresh = {
    nama: r.nama,
    kelas: r.kelas,
    nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    spp_history: (r.spp_history && typeof r.spp_history === 'object' && !Array.isArray(r.spp_history)) ? r.spp_history : {},
    status_kelulusan: r.status_kelulusan || '',
  };
  const freshTagihan = (tRows || []).map(t => ({
    id: t.id, nama: t.nama, kelas: t.kelas,
    item_id: t.item_id, item_name: t.item_name,
    nominal: Number(t.nominal) || 0, paid_amount: Number(t.paid_amount) || 0,
  }));

  const idx = appState.students.findIndex(s => s.nama === nama);
  const before = JSON.stringify([idx >= 0 ? appState.students[idx] : null,
                                appState.tagihan.filter(t => t.nama === nama)]);
  if (idx >= 0) appState.students[idx] = fresh; else appState.students.push(fresh);
  appState.tagihan = appState.tagihan.filter(t => t.nama !== nama).concat(freshTagihan);
  return before !== JSON.stringify([fresh, freshTagihan]);
}

// ── Load semua data ──
// opts.silent = sinkronisasi latar belakang (tanpa spanduk "Memuat data...",
// dan pilihan pada dropdown Cetak dipertahankan).
async function loadDataForTA(opts = {}) {
  const silent = !!opts.silent;
  if (!silent) showSyncIndicator('⏳ Memuat data...');
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
    if (!silent) showSyncIndicator('✅ Data dimuat', 2000);
    const gi = document.getElementById('gasIcon'); if(gi) gi.textContent='🟢';
    const gl = document.getElementById('gasLabel');
    // "Realtime" bila WebSocket aktif, "Terhubung" bila hanya polling.
    if (gl) gl.textContent = (typeof connStatusLabel === 'function') ? connStatusLabel() : 'Terhubung';
    const syncEl = document.getElementById('lastSyncTime');
    if (syncEl) syncEl.textContent = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  } catch(e) {
    if (!silent) showSyncIndicator('⚠️ Gagal memuat', 3000);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.textContent='🔴';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    throw e;
  }
  renderDashboard();
  renderSiswaTable();
  renderTunggakan();
  renderCetakNamaOptions();
  if (silent && typeof refreshInputPageIfIdle === 'function') refreshInputPageIfIdle();
}

// Isi ulang dropdown nama di halaman Cetak tanpa menghilangkan pilihan aktif.
function renderCetakNamaOptions() {
  const sel = document.getElementById('cetakNama');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s => `<option value="${esc(s.nama)}">${esc(s.nama)} — ${esc(s.kelas)}</option>`).join('');
  if (prev && appState.students.some(s => s.nama === prev)) sel.value = prev;
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
  renderCetakNamaOptions();
  const t1 = document.getElementById('cetakTanggal');
  const t2 = document.getElementById('cetakTanggalTotal');
  if (t1) t1.value = new Date().toISOString().split('T')[0];
  if (t2) t2.value = new Date().toISOString().split('T')[0];
}
