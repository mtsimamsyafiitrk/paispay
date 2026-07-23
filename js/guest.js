// ── SiPay · Mode Tamu / Orang Tua ──
// MODE PENGUNJUNG — tanpa pemisahan tahun ajaran
// ══════════════════════════════════════════

function openLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.add('show');
}
function closeLogoutConfirm() {
  document.getElementById('logoutOverlay').classList.remove('show');
}
async function doLogout() {
  closeLogoutConfirm();
  await sbSignOut();               // revoke & hapus token admin (bila ada)
  localStorage.removeItem('sipay_auth');
  localStorage.removeItem('sipay_guest');
  localStorage.removeItem('sipay_admin');
  guestData = { siswa: null, txns: [] };
  showPage('dashboard');
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').style.display = 'none';
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
