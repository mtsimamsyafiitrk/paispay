// ── SiPay · Database Layer (Supabase) ──
async function loadAcademicYears() {
  console.log('Loading academic years...');
  const rows = await sb('academic_years?select=*&order=label');
  console.log('Academic years loaded:', rows);
  allTA = rows;
  activeTA = rows.find(r => r.is_active) || rows[rows.length - 1] || null;
  console.log('Active TA:', activeTA);
  renderTASelector();
  renderTAList();
}

async function setActiveTA(id) {
  // Update Supabase
  await sb('academic_years?is_active=eq.true', 'PATCH', { is_active: false }, { 'Prefer': 'return=minimal' });
  await sb('academic_years?id=eq.' + id, 'PATCH', { is_active: true }, { 'Prefer': 'return=minimal' });
  await loadAcademicYears();
  await loadDataForTA();
  toast('✅ Beralih ke TA ' + (activeTA?.label || ''));
}

async function addTahunAjaran() {
  const label = document.getElementById('newTaLabel').value.trim();
  if (!label) { toast('⚠️ Isi label tahun ajaran dulu'); return; }
  // Normalisasi: ganti strip/dash dengan slash
  const normalized = label.replace(/[-–]/g, '/');
  if (!normalized.match(/^\d{4}\/\d{4}$/)) {
    toast('⚠️ Format harus: 2027/2028');
    return;
  }
  if (allTA.find(t => t.label === normalized)) { toast('⚠️ TA ' + normalized + ' sudah ada'); return; }
  try {
    await sb('academic_years', 'POST', { label: normalized, is_active: false }, { 'Prefer': 'return=minimal' });
    document.getElementById('newTaLabel').value = '';
    await loadAcademicYears();
    toast('✅ Tahun Ajaran ' + normalized + ' berhasil ditambahkan');
  } catch(e) {
    toast('⚠️ Gagal tambah TA: ' + e.message);
    console.error(e);
  }
}

async function deleteTahunAjaran(id, label) {
  if (!confirm('Hapus TA ' + label + '? Data siswa & transaksi di TA ini juga akan dihapus.')) return;
  await sb('transactions?ta_id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });
  await sb('students?ta_id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });
  await sb('academic_years?id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });
  await loadAcademicYears();
  await loadDataForTA();
  toast('🗑️ TA ' + label + ' dihapus');
}

function renderTASelector() {
  const btn = document.getElementById('taCurrentLabel');
  if (btn) btn.textContent = activeTA?.label || '—';
  const dd = document.getElementById('taDropdown');
  if (!dd) return;
  dd.innerHTML = allTA.map(t => `
    <div class="ta-dropdown-item ${t.is_active ? 'active' : ''}" onclick="switchTA('${t.id}',event)">
      ${t.is_active ? '✅' : '📅'} ${t.label}
      ${t.is_active ? '<span class="ta-badge">Aktif</span>' : ''}
    </div>`).join('');
}

function toggleTaDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('taDropdown');
  const btn = document.getElementById('taSelectorBtn');
  if (dd.classList.contains('open')) {
    dd.classList.remove('open');
    return;
  }
  const rect = btn.getBoundingClientRect();
  dd.style.top  = (rect.bottom + 6) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.classList.add('open');
}
async function switchTA(id, e) {
  if (e) e.stopPropagation();
  document.getElementById('taDropdown').classList.remove('open');
  if (activeTA?.id === id) return;
  await setActiveTA(id);
}
document.addEventListener('click', () => {
  const dd = document.getElementById('taDropdown');
  if (dd) dd.classList.remove('open');
});

function renderTAList() {
  const el = document.getElementById('taList');
  if (!el) return;
  if (!allTA.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Belum ada tahun ajaran</div>'; return; }
  el.innerHTML = allTA.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px;">
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">${t.label}</div>
        ${t.is_active ? '<span style="font-size:11px;background:var(--primary);color:#fff;border-radius:4px;padding:1px 7px;">Aktif</span>' : ''}
      </div>
      ${!t.is_active ? `<button class="btn btn-outline btn-sm" onclick="setActiveTA('${t.id}')">Aktifkan</button>` : ''}
      ${!t.is_active ? `<button class="btn btn-sm" style="background:var(--danger-pale);color:var(--danger);" onclick="deleteTahunAjaran('${t.id}','${t.label}')">🗑️</button>` : ''}
    </div>`).join('');
}

// ══ STUDENTS (TA-aware) ══
async function loadStudents() {
  if (!activeTA) return [];
  const rows = await sb('students?select=*&ta_id=eq.' + activeTA.id + '&order=nama');
  return rows.map(r => ({
    nama: r.nama, kelas: r.kelas, nisn: r.nisn || '',
    spp: Number(r.spp) || 0,
    pangkal: Number(r.pangkal) || 0,
    pangkal_paid: Number(r.pangkal_paid) || 0,
    spp_paid_months: Array.isArray(r.spp_paid_months) ? r.spp_paid_months : [],
    cross_ta_debt: Array.isArray(r.cross_ta_debt) ? r.cross_ta_debt : [],
    ta_id: r.ta_id,
  }));
}

async function saveState() {
  // Simpan semua siswa TA aktif (dipakai saat bulk operation seperti import massal)
  if (!activeTA) return;
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb(
      'students?on_conflict=nama,ta_id',
      'POST',
      appState.students.map(s => ({
        nama: s.nama, kelas: s.kelas, nisn: s.nisn || '',
        spp: s.spp || 0, pangkal: s.pangkal || 0,
        pangkal_paid: s.pangkal_paid || 0,
        spp_paid_months: s.spp_paid_months || [],
        cross_ta_debt: s.cross_ta_debt || [],
        ta_id: activeTA.id,
      })),
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    );
    showSyncIndicator('✅ Tersimpan', 2000);
  } catch(e) {
    console.error('saveState error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

// Simpan hanya 1 siswa yang berubah (lebih efisien dari saveState)
async function saveSiswa(s) {
  if (!activeTA || !s) return;
  showSyncIndicator('💾 Menyimpan...');
  try {
    await sb(
      'students?on_conflict=nama,ta_id',
      'POST',
      [{
        nama: s.nama, kelas: s.kelas, nisn: s.nisn || '',
        spp: s.spp || 0, pangkal: s.pangkal || 0,
        pangkal_paid: s.pangkal_paid || 0,
        spp_paid_months: s.spp_paid_months || [],
        cross_ta_debt: s.cross_ta_debt || [],
        ta_id: s.ta_id || activeTA.id,
      }],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' }
    );
    showSyncIndicator('✅ Tersimpan', 1500);
  } catch(e) {
    console.error('saveSiswa error:', e);
    showSyncIndicator('⚠️ Gagal simpan: ' + e.message, 3000);
  }
}

async function deleteStudentFromDB(nama) {
  if (!activeTA) return;
  try {
    await sb('students?nama=eq.' + encodeURIComponent(nama) + '&ta_id=eq.' + activeTA.id, 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('deleteStudentFromDB error:', e); }
}

// ══ TRANSACTIONS (TA-aware) ══
async function loadTransactions() {
  if (!activeTA) return [];
  const rows = await sb('transactions?select=*&ta_id=eq.' + activeTA.id + '&order=created_at');
  return rows.map(r => ({
    nama: r.nama, kelas: r.kelas, jenis: r.jenis,
    nominal: Number(r.nominal) || 0, time: r.time, catatan: r.catatan || '',
  }));
}

async function saveTransaction(t) {
  if (!activeTA) return;
  try {
    await sb('transactions', 'POST', {
      nama: t.nama, kelas: t.kelas, jenis: t.jenis,
      nominal: t.nominal || 0, time: t.time, catatan: t.catatan || '',
      ta_id: activeTA.id,
    }, { 'Prefer': 'return=minimal' });
  } catch(e) { console.error('saveTransaction error:', e); }
}

// ══ SETTINGS ══
async function loadSettings() {
  try {
    const rows = await sb('settings?select=*');
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    if (map.payItems?.length) appState.payItems = map.payItems;
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
    // Logo hanya simpan jika ada (bisa besar, skip jika kosong)
    if (logo) records.push({ key: 'logo', value: logo });
    await sb('settings?on_conflict=key', 'POST', records,
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  } catch(e) { console.error('saveSettings error:', e); }
}

// ── Load data untuk TA aktif ──
async function loadDataForTA() {
  showSyncIndicator('⏳ Memuat data...');
  try {
    const [students, transactions] = await Promise.all([loadStudents(), loadTransactions()]);
    appState.students     = students;
    appState.transactions = transactions;
    showSyncIndicator('✅ Data dimuat', 2000);
    const gi = document.getElementById('gasIcon'); if(gi) gi.textContent='🟢';
    const gl = document.getElementById('gasLabel'); if(gl) gl.textContent='Terhubung';
    // Load index semua siswa lintas TA (background, tidak blocking)
    loadAllStudentsIndex().catch(()=>{});
    // Catat waktu terakhir sinkron
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
  // Step 1: Load TA
  try {
    await loadAcademicYears();
    // Update subtitle login dengan TA aktif
    const sub = document.getElementById('loginSub');
    if (sub && activeTA?.label) sub.textContent = 'Sistem Pembayaran • TA ' + activeTA.label;
  } catch(e) {
    console.error('loadAcademicYears error:', e);
    toast('⚠️ Gagal load TA: ' + e.message);
  }
  // Step 2: Load settings
  try {
    await loadSettings();
  } catch(e) {
    console.error('loadSettings error:', e);
  }
  // Step 3: Load data siswa & transaksi
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
  // Jangan render halaman admin jika mode guest
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

