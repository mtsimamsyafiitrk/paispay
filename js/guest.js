// ── SiPay · Mode Tamu / Orang Tua ──
// MODE PENGUNJUNG — tanpa pemisahan tahun ajaran
// ══════════════════════════════════════════

async function initGuestLogin() {
  const sel = document.getElementById('guestSiswa');
  if (!sel) return;
  sel.innerHTML = '<option value="">Memuat daftar santri...</option>';
  try {
    const rows = await sb('students?select=nama,kelas,status_kelulusan&order=nama');
    sel.innerHTML = '<option value="">-- Pilih nama santri --</option>';
    rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.nama;
      const kelasText = r.status_kelulusan ? kelasLabel(r) : 'Kelas ' + r.kelas;
      opt.textContent = r.nama + ' (' + kelasText + ')';
      sel.appendChild(opt);
    });
  } catch(e) {
    sel.innerHTML = '<option value="">Gagal memuat data</option>';
  }
}

async function loadGuestSiswaList() { /* tidak dipakai */ }

async function doLoginGuest() {
  const nama  = document.getElementById('guestSiswa').value;
  const errEl = document.getElementById('guestError');
  if (!nama) { errEl.style.display = 'block'; setTimeout(()=>errEl.style.display='none',3000); return; }

  const btn = document.querySelector('#loginFormGuest .login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memuat...'; }

  try {
    const allSiswa = await sb('students?select=*&nama=eq.' + encodeURIComponent(nama));
    if (!allSiswa.length) { errEl.textContent = 'Santri tidak ditemukan.'; errEl.style.display = 'block'; return; }

    const siswa = allSiswa[0];
    siswa.spp_paid_months = Array.isArray(siswa.spp_paid_months) ? siswa.spp_paid_months : [];

    const txns = await sb('transactions?select=*&nama=eq.' + encodeURIComponent(nama) + '&order=created_at.desc');

    guestData = { siswa, txns };
    localStorage.setItem('sipay_auth', 'guest');
    localStorage.setItem('sipay_guest', JSON.stringify({ nama }));

    document.getElementById('guestSidebarSiswa').textContent = siswa.nama;
    document.getElementById('guestSidebarKelas').textContent = siswa.status_kelulusan ? kelasLabel(siswa) : 'Kelas ' + siswa.kelas;
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
  const { siswa, txns } = guestData;
  if (!siswa) return;
  const fmt  = n => Number(n||0).toLocaleString('id-ID');
  const rp   = n => 'Rp ' + fmt(n);
  const MONTHS_KEY = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
  const MONTHS_FULL = {Jul:'Juli',Agt:'Agustus',Sep:'September',Okt:'Oktober',Nov:'November',Des:'Desember',Jan:'Januari',Feb:'Februari',Mar:'Maret',Apr:'April',Mei:'Mei',Jun:'Juni'};

  document.getElementById('guestNama').textContent  = siswa.nama;
  document.getElementById('guestKelas').textContent = siswa.status_kelulusan ? kelasLabel(siswa) : 'Kelas ' + siswa.kelas;
  const taLabelEl = document.getElementById('guestTALabel');
  if (taLabelEl) taLabelEl.textContent = '';

  // Hitung tunggakan
  const sisaPangkal    = Math.max(0, (siswa.pangkal||0) - (siswa.pangkal_paid||0));
  const belumBayarSPP  = MONTHS_KEY.filter(m => !(siswa.spp_paid_months||[]).includes(m));
  const sppTunggakan   = belumBayarSPP.length * (siswa.spp||0);
  const grandTotal     = sisaPangkal + sppTunggakan;

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

  // ── Rincian tunggakan ──
  let tunggakanHtml = '';
  if (grandTotal === 0) {
    tunggakanHtml = `<div style="background:#fff;border-radius:16px;padding:24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;">
      <div style="font-size:48px;margin-bottom:8px;">🎉</div>
      <div style="font-size:16px;font-weight:700;color:#16a34a;">Alhamdulillah, semua pembayaran lunas!</div>
      <div style="font-size:13px;color:#666;margin-top:4px;">Terima kasih atas kepercayaan Bapak/Ibu.</div>
    </div>`;
  } else {
    if (sisaPangkal > 0) {
      const nomPangkal   = siswa.pangkal || 0;
      const paidPangkal  = siswa.pangkal_paid || 0;
      const pctPangkal   = nomPangkal ? Math.round(paidPangkal/nomPangkal*100) : 0;
      tunggakanHtml += `
      <div style="background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#92400e,#b45309);padding:14px 18px;">
          <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;">Uang Pangkal</div>
          <div style="font-size:16px;font-weight:800;color:#fff;">🏫 Biaya Pendaftaran / Pangkal</div>
        </div>
        <div style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:12px;color:#666;">Total pangkal: ${rp(nomPangkal)}</div>
              <div style="font-size:12px;color:#666;">Sudah dibayar: ${rp(paidPangkal)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:16px;font-weight:800;color:#b45309;">${rp(sisaPangkal)}</div>
              <div style="font-size:11px;color:#b45309;">sisa belum lunas</div>
            </div>
          </div>
          <div style="margin-top:10px;background:#fef3c7;border-radius:8px;height:8px;overflow:hidden;">
            <div style="background:#b45309;height:100%;width:${pctPangkal}%;border-radius:8px;"></div>
          </div>
          <div style="font-size:11px;color:#888;margin-top:4px;">${pctPangkal}% terbayar</div>
        </div>
      </div>`;
    }
    if (sppTunggakan > 0) {
      tunggakanHtml += `
      <div style="background:#fff;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.07);margin-bottom:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#b91c1c,#ef4444);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:.5px;">SPP Bulanan</div>
            <div style="font-size:16px;font-weight:800;color:#fff;">📅 Tunggakan SPP</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:rgba(255,255,255,.75);">Total</div>
            <div style="font-size:16px;font-weight:800;color:#fff;">${rp(sppTunggakan)}</div>
          </div>
        </div>
        <div style="padding:16px;">
          <div style="font-weight:600;font-size:14px;margin-bottom:8px;">📅 Bulan Belum Dibayar (${belumBayarSPP.length} bulan × ${rp(siswa.spp||0)})</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${belumBayarSPP.map(m=>`<span style="background:#fef2f2;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:600;">${MONTHS_FULL[m]||m}</span>`).join('')}
          </div>
        </div>
      </div>`;
    }
  }

  // ── Riwayat pembayaran ──
  const allTxns = txns || [];
  let riwayatHtml = '';
  if (!allTxns.length) {
    riwayatHtml = `<div style="text-align:center;color:#999;padding:20px;font-size:13px;">Belum ada riwayat pembayaran.</div>`;
  } else {
    const total = allTxns.reduce((s,t)=>s+(t.nominal||0),0);
    riwayatHtml = `
      <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:8px;padding:6px 12px;background:var(--primary-pale);border-radius:8px;">
        💳 Total Terbayar: ${rp(total)}
      </div>
      ${allTxns.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid #f5f5f5;">
        <div>
          <div style="font-size:13px;font-weight:600;">${t.jenis||'—'}</div>
          <div style="font-size:11px;color:#999;">${t.created_at ? new Date(t.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : t.time || '—'}</div>
        </div>
        <div style="font-size:14px;font-weight:700;color:#16a34a;">+${rp(t.nominal)}</div>
      </div>`).join('')}`;
  }

  document.getElementById('guestStatGrid').innerHTML     = statusHtml;
  document.getElementById('guestTunggakanList').innerHTML = tunggakanHtml;
  document.getElementById('guestTransaksiList').innerHTML = riwayatHtml;
}

function openLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.add('show');
}
function closeLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.remove('show');
}
function doLogout() {
  closeLogoutConfirm();
  localStorage.removeItem('sipay_auth');
  localStorage.removeItem('sipay_guest');
  guestData = { siswa: null, txns: [] };
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
