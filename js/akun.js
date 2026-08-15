// ── SiPay · Akun Admin ──
// AKUN ADMIN
// ══════════════════════════════════════════
// Data akun untuk tampilan (nama, email kontak, hp). Password TIDAK lagi
// disimpan di sini — kredensial dikelola Supabase Auth.
function getAkunData() {
  try { return JSON.parse(localStorage.getItem('sipay_akun') || 'null') || { user:'Admin', email:'', hp:'' }; }
  catch { return { user:'Admin', email:'', hp:'' }; }
}
async function saveAkunData(data) {
  const clean = { user: data.user || 'Admin', email: data.email || '', hp: data.hp || '' };
  localStorage.setItem('sipay_akun', JSON.stringify(clean));
  localStorage.setItem('sipay_admin', JSON.stringify({ user: clean.user }));
  await saveSettings();
}
function renderAkunPage() {
  const a = getAkunData();
  const el = id => document.getElementById(id);
  if (!el('akunAvatar')) return;
  el('akunAvatar').textContent      = (a.user || 'A')[0].toUpperCase();
  el('akunNamaDisplay').textContent = a.user  || 'Admin';
  el('akunEmailDisplay').textContent = a.email ? '✉️ ' + a.email : '✉️ Belum diisi';
  el('akunHpDisplay').textContent    = a.hp    ? '📱 ' + a.hp    : '📱 Belum diisi';
}
function openEditAkun() {
  const a = getAkunData();
  document.getElementById('akun_user').value  = a.user  || '';
  document.getElementById('akun_email').value = a.email || '';
  document.getElementById('akun_hp').value    = a.hp    || '';
  document.getElementById('editAkunModal').classList.add('open');
}
async function saveEditAkun() {
  const user  = document.getElementById('akun_user').value.trim();
  const email = document.getElementById('akun_email').value.trim();
  const hp    = document.getElementById('akun_hp').value.trim();
  if (!user) { toast('⚠️ Username tidak boleh kosong'); return; }
  const a = getAkunData();
  await saveAkunData({ ...a, user, email, hp });
  document.getElementById('editAkunModal').classList.remove('open');
  renderAkunPage();
  document.getElementById('adminLabel').textContent = user;
  toast('✅ Profil akun berhasil disimpan!');
}

// Ganti password: admin sudah terautentikasi (punya sesi), jadi tak perlu OTP
// email lagi — langsung ke input password baru, lalu update via Supabase Auth.
//
// Alur OTP lama sudah DIBUANG. Selain tak terpakai (openGantiPassword langsung
// ke langkah 3), kodenya dibuat DAN dicocokkan di dalam browser
// (`input !== otpCode`) — pola yang bisa dilewati siapa pun lewat konsol, jadi
// tidak layak dihidupkan lagi. Ikut terbuang: pustaka EmailJS dari CDN beserta
// kunci publiknya.
function openGantiPassword() {
  if (!hasAdminSession()) { toast('⚠️ Sesi berakhir — login ulang dulu'); return; }
  document.getElementById('gp_newpass').value = '';
  document.getElementById('gp_newpass2').value = '';
  document.getElementById('gp_step3_error').style.display = 'none';
  document.getElementById('gantiPassModal').classList.add('open');
}
function closeGantiPass() {
  document.getElementById('gantiPassModal').classList.remove('open');
}
async function saveNewPassword() {
  const p1 = document.getElementById('gp_newpass').value;
  const p2 = document.getElementById('gp_newpass2').value;
  const errEl = document.getElementById('gp_step3_error');
  if (!p1) { errEl.textContent = '⚠️ Password baru tidak boleh kosong'; errEl.style.display='block'; return; }
  if (p1.length < 6) { errEl.textContent = '⚠️ Password minimal 6 karakter'; errEl.style.display='block'; return; }
  if (p1 !== p2) { errEl.textContent = '❌ Konfirmasi password tidak cocok'; errEl.style.display='block'; return; }
  try {
    await sbUpdatePassword(p1);
  } catch (e) {
    errEl.textContent = '❌ Gagal ubah password: ' + (e.message || 'coba lagi');
    errEl.style.display = 'block';
    return;
  }
  closeGantiPass();
  toast('✅ Password berhasil diubah! Silakan login ulang.');
  setTimeout(doLogout, 1500);
}
document.addEventListener('DOMContentLoaded', () => {
  renderAkunPage();
  const em = document.getElementById('editAkunModal');
  if (em) em.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  const gm = document.getElementById('gantiPassModal');
  if (gm) gm.addEventListener('click', function(e) { if(e.target===this) closeGantiPass(); });
  const gasModal = document.getElementById('gasSetupModal');
  if (gasModal) gasModal.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });

  // Sync nama madrasah & logo ke halaman login
  const p = getProfil();
  const loginTitle = document.getElementById('loginTitle');
  if (loginTitle) loginTitle.textContent = p.nama || 'SiPay';
  const loginSub = document.getElementById('loginSub');
  if (loginSub) loginSub.textContent = 'Sistem Pembayaran Santri';
  const logo = getLogo();
  if (logo) {
    const loginLogo = document.getElementById('loginLogo');
    if (loginLogo) loginLogo.innerHTML = `<img src="${safeUrl(logo)}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
  }
});

// ══════════════════════════════════════════
