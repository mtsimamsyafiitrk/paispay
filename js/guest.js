// ── SiPay · Mode Tamu / Orang Tua ──
// MODE PENGUNJUNG
// ══════════════════════════════════════════

async function initGuestLogin() {
  const sel = document.getElementById('guestSiswa');
  if (!sel) return;
  sel.innerHTML = '<option value="">Memuat daftar santri...</option>';
  try {
    // Ambil TA aktif
    const tas = await sb('academic_years?select=*&is_active=eq.true&limit=1');
    if (!tas.length) { sel.innerHTML = '<option value="">Tidak ada TA aktif</option>'; return; }
    const ta = tas[0];
    // Simpan taId aktif ke hidden input
    let hiddenTA = document.getElementById('guestTAHidden');
    if (!hiddenTA) {
      hiddenTA = document.createElement('input');
      hiddenTA.type = 'hidden';
      hiddenTA.id = 'guestTAHidden';
      document.getElementById('loginFormGuest').appendChild(hiddenTA);
    }
    hiddenTA.value = ta.id;
    hiddenTA.dataset.label = ta.label;
    // Ambil semua siswa TA aktif
    const rows = await sb('students?select=nama,kelas&ta_id=eq.' + ta.id + '&order=nama');
    sel.innerHTML = '<option value="">-- Pilih nama santri --</option>';
    rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.nama;
      opt.textContent = r.nama + ' (Kelas ' + r.kelas + ')';
      sel.appendChild(opt);
    });
  } catch(e) {
    sel.innerHTML = '<option value="">Gagal memuat data</option>';
  }
}

async function loadGuestSiswaList() { /* tidak dipakai lagi */ }

async function doLoginGuest() {
  const nama    = document.getElementById('guestSiswa').value;
  const hiddenTA = document.getElementById('guestTAHidden');
  const taId    = hiddenTA?.value || '';
  const taLabel = hiddenTA?.dataset?.label || '';
  const errEl   = document.getElementById('guestError');
  if (!nama) { errEl.style.display = 'block'; setTimeout(()=>errEl.style.display='none',3000); return; }

  const btn = document.querySelector('#loginFormGuest .login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

  try {
    // Ambil data siswa dari semua TA (berdasarkan nama)
    const allSiswa = await sb('students?select=*&nama=eq.' + encodeURIComponent(nama) + '&order=ta_id');
    if (!allSiswa.length) { errEl.textContent = 'Santri tidak ditemukan.'; errEl.style.display = 'block'; return; }

    // Siswa TA aktif sebagai data utama
    const siswa = allSiswa.find(s => s.ta_id === taId) || allSiswa[0];
    siswa.spp_paid_months = Array.isArray(siswa.spp_paid_months) ? siswa.spp_paid_months : [];
    siswa.cross_ta_debt   = Array.isArray(siswa.cross_ta_debt)   ? siswa.cross_ta_debt   : [];

    // Ambil semua TA untuk label
    const allTAs = await sb('academic_years?select=*');
    const taMap = {};
    allTAs.forEach(t => { taMap[t.id] = t.label; });

    // Ambil transaksi dari semua TA
    const txns = await sb('transactions?select=*&nama=eq.' + encodeURIComponent(nama) + '&order=created_at.desc');

    // Susun data per TA
    const perTA = allSiswa.map(s => ({
      ...s,
      spp_paid_months: Array.isArray(s.spp_paid_months) ? s.spp_paid_months : [],
      cross_ta_debt: Array.isArray(s.cross_ta_debt) ? s.cross_ta_debt : [],
      taLabel: taMap[s.ta_id] || s.ta_id,
      txns: txns.filter(t => t.ta_id === s.ta_id),
    }));

    guestData = { siswa, taId, taLabel, txns, perTA, taMap };
    sessionStorage.setItem('sipay_auth', 'guest');
    sessionStorage.setItem('sipay_guest', JSON.stringify({ nama, taId, taLabel }));

    // Isi sidebar guest
    document.getElementById('guestSidebarSiswa').textContent = siswa.nama;
    document.getElementById('guestSidebarKelas').textContent = 'Kelas ' + siswa.kelas;
    const profil = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
    if (profil.nama) document.getElementById('guestSidebarNama').textContent = profil.nama;

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = siswa.nama;
    renderGuestPage();
    showPage('pengunjung');
  } catch(e) {
    errEl.textContent = 'Gagal: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk sebagai Pengunjung'; }
  }
}

function renderGuestPage() {
  const { siswa, taLabel, txns, perTA, taMap } = guestData;
  if (!siswa) return;
  const fmt  = n => Number(n||0).toLocaleString('id-ID');
  const rp   = n => 'Rp ' + fmt(n);
  const bulanNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const MONTHS_KEY = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
  const MONTHS_FULL = {Jul:'Juli',Agt:'Agustus',Sep:'September',Okt:'Oktober',Nov:'November',Des:'Desember',Jan:'Januari',Feb:'Februari',Mar:'Maret',Apr:'April',Mei:'Mei',Jun:'Juni'};

  // Header siswa
  document.getElementById('guestNama').textContent    = siswa.nama;
  document.getElementById('guestKelas').textContent   = 'Kelas ' + siswa.kelas;
  document.getElementById('guestTALabel').textContent = taLabel || '—';

  // Hitung total tunggakan semua TA
  // Pangkal bersifat kumulatif — ambil MAX pangkal_paid dari semua TA
  const allPerTA = perTA || [{ ...siswa, taLabel, txns }];

  // Total sudah bayar pangkal = MAX pangkal_paid dari semua record (kumulatif)
  const nominalPangkal = allPerTA.reduce((max, s) => Math.max(max, s.pangkal||0), 0);
  const totalPangkalPaid = allPerTA.reduce((max, s) => Math.max(max, s.pangkal_paid||0), 0);
  const sisaPangkalGlobal = Math.max(0, nominalPangkal - totalPangkalPaid);

  let grandTotal = 0;
  const allSections = allPerTA.map(s => {
    // Pangkal: hanya tampilkan sisa di TA pertama yang ada tunggakan,
    // TA lain tidak hitung pangkal lagi (sudah kumulatif)
    const belumBayar    = MONTHS_KEY.filter(m => !(s.spp_paid_months||[]).includes(m));
    const sppTunggakan  = belumBayar.length * (s.spp||0);
    const total         = sppTunggakan;
    grandTotal         += total;
    return { s, pangkalSisa: 0, belumBayar, sppTunggakan, total };
  });

  // Tambahkan sisa pangkal ke total keseluruhan (hanya 1x, bukan per TA)
  grandTotal += sisaPangkalGlobal;

  // ── Kartu status ringkas ──
  const statusHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#fff;border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.07);border:2px solid ${grandTotal===0?'#16a34a':'#ef4444'};">
        <div style="font-size:26px;margin-bottom:4px;">${grandTotal===0?'✅':'⚠️'}</div>
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Status</div>
        <div style="font-size:14px;font-weight:800;margin-top:4px;color:${grandTotal===0?'#16a34a':'#ef4444'};">${grandTotal===0?'Lunas Semua':'Ada Tunggakan'}</div>
      </div>
      <div style="background:#fff;border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.07);border:2px solid #ef4444;">
        <div style="font-size:26px;margin-bottom:4px;">💰</div>
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;">Total Tunggakan</div>
        <div style="font-size:14px;font-weight:800;margin-top:4px;color:#ef4444;">${grandTotal===0?'Nihil':rp(grandTotal)}</div>
      </div>
    </div>`;

  // ── Tunggakan per TA ──
  let tunggakanHtml = '';
  if (grandTotal === 0) {
    tunggakanHtml = `<div style="background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;">
      <div style="font-size:48px;margin-bottom:8px;">🎉</div>
      <div style="font-size:16px;font-weight:700;color:#16a34a;">Alhamdulillah, semua pembayaran lunas!</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Terima kasih atas kepercayaan Bapak/Ibu.</div>
    </div>`;
  } else {
    // Tampilkan info pangkal sekali saja di atas (kumulatif)
    if (sisaPangkalGlobal > 0) {
      tunggakanHtml += `
      <div style="background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#92400e,#b45309);padding:14px 18px;">
          <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;">Selama Studi</div>
          <div style="font-size:16px;font-weight:800;color:#fff;">🏫 Uang Pangkal</div>
        </div>
        <div style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:12px;color:#666;">Total pangkal: ${rp(nominalPangkal)}</div>
              <div style="font-size:12px;color:#666;">Sudah dibayar: ${rp(totalPangkalPaid)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:800;color:#b45309;">${rp(sisaPangkalGlobal)}</div>
              <div style="font-size:11px;color:#b45309;">sisa belum lunas</div>
            </div>
          </div>
          <div style="margin-top:10px;background:#fef3c7;border-radius:8px;height:8px;overflow:hidden;">
            <div style="background:#b45309;height:100%;width:${Math.min(100,Math.round(totalPangkalPaid/nominalPangkal*100))}%;border-radius:8px;transition:.5s;"></div>
          </div>
          <div style="font-size:11px;color:#888;margin-top:4px;">${Math.round(totalPangkalPaid/nominalPangkal*100)}% terbayar</div>
        </div>
      </div>`;
    }

    allSections.forEach(({ s, belumBayar, sppTunggakan, total }) => {
      if (total === 0) {
        tunggakanHtml += `<div style="background:#fff;border-radius:16px;padding:14px 18px;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:12px;display:flex;align-items:center;gap:12px;">
          <div style="font-size:22px;">✅</div>
          <div><div style="font-weight:700;font-size:14px;color:#16a34a;">TA ${s.taLabel} — SPP Lunas</div>
          <div style="font-size:12px;color:#666;">Semua bulan SPP terpenuhi</div></div>
        </div>`;
        return;
      }
      tunggakanHtml += `
      <div style="background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#b91c1c,#ef4444);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;">Tahun Ajaran</div>
            <div style="font-size:16px;font-weight:800;color:#fff;">TA ${s.taLabel}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:rgba(255,255,255,.75);">Tunggakan SPP</div>
            <div style="font-size:16px;font-weight:800;color:#fff;">${rp(sppTunggakan)}</div>
          </div>
        </div>
        <div style="padding:16px;">
          <div style="padding:10px 0;">
            <div style="font-weight:600;font-size:14px;margin-bottom:8px;">📅 SPP Belum Dibayar (${belumBayar.length} bulan × ${rp(s.spp||0)})</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${belumBayar.map(m=>`<span style="background:#fef2f2;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;">${MONTHS_FULL[m]||m}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
    });
  }

  // ── Riwayat pembayaran semua TA ──
  const allTxns = txns || [];
  let riwayatHtml = '';
  if (!allTxns.length) {
    riwayatHtml = `<div style="text-align:center;color:#999;padding:20px;font-size:13px;">Belum ada riwayat pembayaran.</div>`;
  } else {
    // Kelompokkan per TA
    const txnByTA = {};
    allTxns.forEach(t => {
      const label = taMap?.[t.ta_id] || 'TA Lainnya';
      if (!txnByTA[label]) txnByTA[label] = [];
      txnByTA[label].push(t);
    });
    Object.entries(txnByTA).forEach(([label, list]) => {
      const totalTA = list.reduce((s,t)=>s+(t.nominal||0),0);
      riwayatHtml += `
        <div style="margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:8px;padding:6px 12px;background:var(--primary-pale);border-radius:8px;">
            📅 TA ${label} — Total: ${rp(totalTA)}
          </div>
          ${list.map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid #f5f5f5;">
            <div>
              <div style="font-size:13px;font-weight:600;">${t.jenis||'—'}</div>
              <div style="font-size:11px;color:#999;">${t.time ? new Date(t.time).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '—'}</div>
            </div>
            <div style="font-size:14px;font-weight:700;color:#16a34a;">+${rp(t.nominal)}</div>
          </div>`).join('')}
        </div>`;
    });
  }

  // Render semua ke halaman pengunjung
  document.getElementById('guestStatGrid').innerHTML    = statusHtml;
  document.getElementById('guestTunggakanList').innerHTML = tunggakanHtml;
  document.getElementById('guestTransaksiList').innerHTML = riwayatHtml;
}

// isGuest() ada di script utama
function openLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.add('show');
}
function closeLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.remove('show');
}
function doLogout() {
  closeLogoutConfirm();
  sessionStorage.removeItem('sipay_auth');
  sessionStorage.removeItem('sipay_guest');
  guestData = { siswa: null, taId: null, taLabel: '' };
  showPage('dashboard');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').style.display = 'none';
  switchLoginMode('admin');
  document.getElementById('loginScreen').classList.remove('hidden');
  setTimeout(() => document.getElementById('loginUser').focus(), 100);
}

async function testGasConnection() {
  const url = document.getElementById('gasUrlInput').value.trim();
  const res = document.getElementById('gasTestResult');
  if (!url) { res.innerHTML = '<span style="color:var(--danger)">⚠️ Isi URL dulu</span>'; return; }
  res.innerHTML = '⏳ Testing...';
  try {
    const r = await fetch(url + '?action=ping');
    const data = await r.json();
    if (data.ok) {
      res.innerHTML = `<span style="color:var(--primary-light)">✅ Koneksi berhasil! Server time: ${data.time}</span>`;
    } else {
      res.innerHTML = `<span style="color:var(--danger)">❌ Respons tidak valid: ${JSON.stringify(data)}</span>`;
    }
  } catch(e) {
    res.innerHTML = `<span style="color:var(--danger)">❌ Gagal: ${e.message}</span>`;
  }
}

function saveGasUrl() {
  const url = document.getElementById('gasUrlInput').value.trim();
  if (!url) { toast('⚠️ URL tidak boleh kosong'); return; }
  localStorage.setItem('sipay_gas_url', url);
  document.getElementById('gasSetupModal').classList.remove('open');
  toast('✅ URL berhasil disimpan!');
}


// ══════════════════════════════════════════
