// ── SiPay · Database Layer (Supabase) — No TA separation ──

// Flag: apakah kolom status_kelulusan sudah ada di DB (auto-detect)
let _skColExists = null;
// Flag: apakah kolom uang_pendaftaran sudah ada di DB (auto-detect)
let _upColExists = null;

// Deteksi kolom opsional di awal sebelum ada operasi save
async function _detectOptionalColumns() {
  try {
    await sb('students?select=status_kelulusan,uang_pendaftaran,uang_pendaftaran_paid&limit=0');
    _skColExists = true;
    _upColExists = true;
  } catch(_) {
    // Tes masing-masing kolom secara terpisah
    try { await sb('students?select=status_kelulusan&limit=0'); _skColExists = true; }
    catch(_) { _skColExists = false; }
    try { await sb('students?select=uang_pendaftaran&limit=0'); _upColExists = true; }
    catch(_) { _upColExists = false; }
  }
}

function _buildStudentRow(s, includeStatus, includeUP = true) {
  const row = {
    nama: s.nama, kelas: s.kelas, nisn: s.nisn || '',
    spp: s.spp || 0, pangkal: s.pangkal || 0,
    pangkal_paid: s.pangkal_paid || 0,
    spp_paid_months: s.spp_paid_months || [],
    spp_history: s.spp_history || {},
  };
  if (includeStatus) row.status_kelulusan = s.status_kelulusan || '';
  if (includeUP) {
    row.uang_pendaftaran = s.uang_pendaftaran || 0;
    row.uang_pendaftaran_paid = s.uang_pendaftaran_paid || 0;
  }
  return row;
}

async function _sbStudentsUpsert(payload) {
  try {
    return await sb(
      'students?on_conflict=nama',
      'POST',
      payload,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    );
  } catch(e) {
    // Fallback jika UNIQUE constraint belum ada di tabel students
    if (e.message && e.message.includes('42P10')) {
      console.warn(
        'Unique constraint belum ada. Jalankan supabase_migration.sql di Supabase SQL Editor. ' +
        'Menggunakan fallback PATCH/POST satu per satu sementara.'
      );
      const existing = await sb('students?select=nama');
      const existingNames = new Set(existing.map(r => r.nama));
      for (const row of payload) {
        if (existingNames.has(row.nama)) {
          await sb('students?nama=eq.' + encodeURIComponent(row.nama), 'PATCH', row,
            { 'Prefer': 'return=minimal' });
        } else {
          await sb('students', 'POST', row, { 'Prefer': 'return=minimal' });
        }
      }
      return [];
    }
    throw e;
  }
}

// ══ STUDENTS ══
async function loadStudents() {
  const rows = await sb('students?select=*&order=nama');
  return rows.map(r => ({
    nama: r.nama, kelas: r.kelas, nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    pangkal: Number(r.pangkal) || 0,
    pangkal_paid: Number(r.pangkal_paid) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    spp_history: r.spp_history || {},
    status_kelulusan: r.status_kelulusan || '',
    uang_pendaftaran: Number(r.uang_pendaftaran) || 0,
    uang_pendaftaran_paid: Number(r.uang_pendaftaran_paid) || 0,
  }));
}

async function saveState() {
  showSyncIndicator('💾 Menyimpan...');
  const _rows = (sk, up) => appState.students.map(s => _buildStudentRow(s, sk, up));
  const _sk = () => _skColExists !== false;
  const _up = () => _upColExists !== false;
  try {
    await _sbStudentsUpsert(_rows(_sk(), _up()));
    if (_sk()) _skColExists = true;
    if (_up()) _upColExists = true;
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch(e) {
    let changed = false;
    if (e.message?.includes('uang_pendaftaran')) { _upColExists = false; changed = true; console.warn('Kolom uang_pendaftaran belum ada — jalankan supabase_migration.sql'); }
    if (e.message?.includes('status_kelulusan')) { _skColExists = false; changed = true; console.warn('Kolom status_kelulusan belum ada — jalankan supabase_migration.sql'); }
    if (changed) {
      try {
        await _sbStudentsUpsert(_rows(_sk(), _up()));
        showSyncIndicator('✅ Tersimpan', 2000);
        return;
      } catch(e2) {
        // Last resort: hanya kolom dasar
        try { await _sbStudentsUpsert(_rows(false, false)); showSyncIndicator('✅ Tersimpan', 2000); return; } catch(e3) {}
        console.error('saveState fallback error:', e2);
        showSyncIndicator('⚠️ Gagal simpan: ' + e2.message, 3000);
        return;
      }
    }
    console.error('saveState error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

async function saveSiswa(s) {
  if (!s) return;
  showSyncIndicator('💾 Menyimpan...');
  const _row = (sk, up) => [_buildStudentRow(s, sk, up)];
  const _sk = () => _skColExists !== false;
  const _up = () => _upColExists !== false;
  try {
    await _sbStudentsUpsert(_row(_sk(), _up()));
    if (_sk()) _skColExists = true;
    if (_up()) _upColExists = true;
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    let changed = false;
    if (e.message?.includes('uang_pendaftaran')) { _upColExists = false; changed = true; console.warn('Kolom uang_pendaftaran belum ada — jalankan supabase_migration.sql'); }
    if (e.message?.includes('status_kelulusan')) { _skColExists = false; changed = true; }
    if (changed) {
      try {
        await _sbStudentsUpsert(_row(_sk(), _up()));
        showSyncIndicator('✅ Tersimpan', 1500);
        return;
      } catch(e2) {
        // Last resort: hanya kolom dasar
        try { await _sbStudentsUpsert(_row(false, false)); showSyncIndicator('✅ Tersimpan', 1500); return; } catch(e3) {}
        console.error('saveSiswa fallback error:', e2);
        showSyncIndicator('⚠️ Gagal simpan: ' + e2.message, 3000);
        return;
      }
    }
    console.error('saveSiswa error:', e);
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
    if (Array.isArray(map.payItems)) appState.payItems = map.payItems;
    if (map.profil && Object.keys(map.profil).length) {
      localStorage.setItem('sipay_profil', JSON.stringify(map.profil));
    }
    if (map.logo) {
      localStorage.setItem('sipay_logo', map.logo);
    }
    if (map.akun && map.akun.user) {
      localStorage.setItem('sipay_akun', JSON.stringify(map.akun));
      localStorage.setItem('sipay_admin', JSON.stringify({ user: map.akun.user, pass: map.akun.pass }));
    }
  } catch(e) { console.error('loadSettings error:', e); }
}

async function saveSettings() {
  const profil = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const akun   = JSON.parse(localStorage.getItem('sipay_akun')   || '{}');
  const logo   = localStorage.getItem('sipay_logo') || '';
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
    const [students, transactions] = await Promise.all([loadStudents(), loadTransactions()]);
    appState.students     = students;
    appState.transactions = transactions;
    // Cache ke localStorage untuk fallback offline
    if (students.length < 500) {
      try {
        localStorage.setItem('sipay_state', JSON.stringify({
          students:     appState.students,
          transactions: appState.transactions,
          payItems:     appState.payItems,
          savedAt:      new Date().toISOString(),
        }));
      } catch { /* quota exceeded — abaikan */ }
    }
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
    appState.students.map(s => `<option value="${s.nama}">${s.nama} — ${s.kelas}</option>`).join('');
}

async function initApp() {
  showSyncIndicator('⏳ Memuat data...');
  // Deteksi kolom opsional sebelum operasi save apapun
  await _detectOptionalColumns().catch(() => {});
  // Load settings
  try {
    await loadSettings();
  } catch(e) {
    console.error('loadSettings error:', e);
  }
  // Migrasi payItems SPMB: pastikan item pendaftaran ada dan pangkal mencakup 'calon'
  let _spmbMigrated = false;
  if (!appState.payItems.find(i => i.id === 'pendaftaran')) {
    appState.payItems.push({ id:'pendaftaran', name:'Uang Pendaftaran', amount:0, type:'tetap', active:true, kelas:['calon'] });
    _spmbMigrated = true;
  }
  const _pangkalItem = appState.payItems.find(i => i.id === 'pangkal');
  if (_pangkalItem && !_pangkalItem.kelas.includes('calon')) {
    _pangkalItem.kelas.push('calon');
    _spmbMigrated = true;
  }
  if (_spmbMigrated) { try { await saveSettings(); } catch(e) { console.warn('SPMB migration saveSettings error:', e); } }
  // Load data siswa & transaksi
  try {
    await loadDataForTA();
  } catch(e) {
    console.error('loadDataForTA error:', e);
    showSyncIndicator('⚠️ Offline — pakai data lokal', 3000);
    const gi2 = document.getElementById('gasIcon'); if(gi2) gi2.textContent='🔴';
    const gl2 = document.getElementById('gasLabel'); if(gl2) gl2.textContent='Offline';
    const saved = JSON.parse(localStorage.getItem('sipay_state') || 'null');
    if (saved?.students)     appState.students     = saved.students;
    if (saved?.transactions) appState.transactions = saved.transactions;
    if (saved?.payItems?.length) appState.payItems = saved.payItems;
  }
  if (isGuest()) return;
  renderDashboard();
  renderSiswaTable();
  renderTunggakan();
  // Cek laporan pending untuk badge admin
  sb('payment_reports?select=id&status=eq.pending').then(rows => {
    const b = document.getElementById('adminLaporBadge');
    if (b && rows.length) { b.textContent = rows.length; b.style.display = 'inline'; }
  }).catch(()=>{});
  // Load template kuitansi ke memory
  loadTemplateKuitansi().catch(()=>{});
  const sel = document.getElementById('cetakNama');
  if (sel) sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s => `<option value="${s.nama}">${s.nama} — ${s.kelas}</option>`).join('');
  const t1 = document.getElementById('cetakTanggal');
  const t2 = document.getElementById('cetakTanggalTotal');
  if (t1) t1.value = new Date().toISOString().split('T')[0];
  if (t2) t2.value = new Date().toISOString().split('T')[0];
}
