// ── SiPay · Akun Admin, EmailJS & Notifikasi ──
// AKUN ADMIN
// ══════════════════════════════════════════
const EMAILJS_SVC  = 'service_44479eq';
const EMAILJS_TPL  = 'template_wo9w96i';
const EMAILJS_KEY  = 'OKFiGZTDpsAbkIFCZ';

function getAkunData() {
  try { return JSON.parse(localStorage.getItem('sipay_akun') || 'null') || { user:'admin', pass:'sipay123', email:'', hp:'' }; }
  catch { return { user:'admin', pass:'sipay123', email:'', hp:'' }; }
}
async function saveAkunData(data) {
  localStorage.setItem('sipay_akun', JSON.stringify(data));
  localStorage.setItem('sipay_admin', JSON.stringify({ user: data.user, pass: data.pass }));
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

let otpCode = '', otpExpiry = 0, otpTimerInterval = null;

function openGantiPassword() {
  const a = getAkunData();
  if (!a.email) { toast('⚠️ Isi email dulu di Edit Profil Akun'); openEditAkun(); return; }
  const [local, domain] = a.email.split('@');
  const masked = local.slice(0,2) + '***@' + domain;
  document.getElementById('gp_emailHint').textContent = masked;
  document.getElementById('gp_emailSent').textContent = masked;
  document.getElementById('gp_step1').style.display = 'block';
  document.getElementById('gp_step2').style.display = 'none';
  document.getElementById('gp_step3').style.display = 'none';
  document.getElementById('gp_step1_error').style.display = 'none';
  const btn = document.getElementById('gp_sendBtn');
  if (btn) { btn.disabled = false; btn.textContent = '📧 Kirim Kode Verifikasi'; }
  document.getElementById('gantiPassModal').classList.add('open');
}
function closeGantiPass() {
  clearInterval(otpTimerInterval);
  document.getElementById('gantiPassModal').classList.remove('open');
}
async function sendOTP(resend) {
  const a = getAkunData();
  if (!a.email) { toast('⚠️ Email belum diisi'); return; }
  otpCode   = String(Math.floor(100000 + Math.random() * 900000));
  otpExpiry = Date.now() + 5 * 60 * 1000;
  const btn = document.getElementById('gp_sendBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengirim...'; }
  try {
    await emailjs.send(EMAILJS_SVC, EMAILJS_TPL, { to_email: a.email, otp_code: otpCode }, EMAILJS_KEY);
    document.getElementById('gp_step1').style.display = 'none';
    document.getElementById('gp_step2').style.display = 'block';
    document.getElementById('gp_otp').value = '';
    document.getElementById('gp_step2_error').style.display = 'none';
    startOTPTimer();
    toast('📧 Kode OTP dikirim ke email!');
  } catch(e) {
    const err = document.getElementById('gp_step1_error');
    err.textContent = '❌ Gagal kirim email: ' + (e.text || e.message || 'Cek koneksi internet');
    err.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = '📧 Kirim Kode Verifikasi'; }
  }
}
function startOTPTimer() {
  clearInterval(otpTimerInterval);
  const el = document.getElementById('gp_timer');
  otpTimerInterval = setInterval(() => {
    const sisa = Math.max(0, Math.ceil((otpExpiry - Date.now()) / 1000));
    const m = Math.floor(sisa / 60), s = sisa % 60;
    el.textContent = sisa > 0 ? `⏱️ Kode berlaku ${m}:${String(s).padStart(2,'0')}` : '⌛ Kode kadaluarsa. Kirim ulang.';
    if (sisa === 0) clearInterval(otpTimerInterval);
  }, 1000);
}
function verifyOTP() {
  const input = document.getElementById('gp_otp').value.trim();
  const errEl = document.getElementById('gp_step2_error');
  if (!input) { errEl.textContent = '⚠️ Masukkan kode OTP dulu'; errEl.style.display='block'; return; }
  if (Date.now() > otpExpiry) { errEl.textContent = '⌛ Kode kadaluarsa. Kirim ulang.'; errEl.style.display='block'; return; }
  if (input !== otpCode) { errEl.textContent = '❌ Kode OTP salah. Coba lagi.'; errEl.style.display='block'; return; }
  clearInterval(otpTimerInterval);
  document.getElementById('gp_step2').style.display = 'none';
  document.getElementById('gp_step3').style.display = 'block';
  document.getElementById('gp_newpass').value = '';
  document.getElementById('gp_newpass2').value = '';
  document.getElementById('gp_step3_error').style.display = 'none';
}
async function saveNewPassword() {
  const p1 = document.getElementById('gp_newpass').value;
  const p2 = document.getElementById('gp_newpass2').value;
  const errEl = document.getElementById('gp_step3_error');
  if (!p1) { errEl.textContent = '⚠️ Password baru tidak boleh kosong'; errEl.style.display='block'; return; }
  if (p1.length < 6) { errEl.textContent = '⚠️ Password minimal 6 karakter'; errEl.style.display='block'; return; }
  if (p1 !== p2) { errEl.textContent = '❌ Konfirmasi password tidak cocok'; errEl.style.display='block'; return; }
  const a = getAkunData();
  await saveAkunData({ ...a, pass: p1 });
  closeGantiPass();
  toast('✅ Password berhasil diubah! Silakan login ulang.');
  setTimeout(doLogout, 1500);
}
document.addEventListener('DOMContentLoaded', () => {
  if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_KEY);
  renderAkunPage();
  const em = document.getElementById('editAkunModal');
  if (em) em.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  const gm = document.getElementById('gantiPassModal');
  if (gm) gm.addEventListener('click', function(e) { if(e.target===this) closeGantiPass(); });
});

document.addEventListener('DOMContentLoaded', () => {
  const gasModal = document.getElementById('gasSetupModal');
  if (gasModal) gasModal.addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // Sync nama madrasah & logo ke halaman login
  const p = getProfil();
  document.getElementById('loginTitle').textContent = p.nama || 'SiPay';
  document.getElementById('loginSub').textContent = 'Sistem Pembayaran Santri';
  const logo = getLogo();
  if (logo) {
    document.getElementById('loginLogo').innerHTML = `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">`;
  }
  // Jika session masih aktif, langsung masuk tanpa login ulang
  if (isLoggedIn()) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    showPage('dashboard');
  } else if (isGuest()) {
    // Session guest masih aktif — reload data siswa dan tampilkan halaman pengunjung
    const g = JSON.parse(sessionStorage.getItem('sipay_guest') || '{}');
    if (g.nama) {
      document.getElementById('loginScreen').classList.add('hidden');
      Promise.all([
        sb('students?select=*&nama=eq.' + encodeURIComponent(g.nama)),
        sb('transactions?select=*&nama=eq.' + encodeURIComponent(g.nama) + '&order=created_at.desc'),
      ]).then(([allSiswa, txns]) => {
        if (!allSiswa.length) throw new Error('Santri tidak ditemukan');
        const siswa = allSiswa[0];
        siswa.spp_paid_months = Array.isArray(siswa.spp_paid_months) ? siswa.spp_paid_months : [];
        guestData = { siswa, txns };
        document.getElementById('adminLabel').textContent = siswa.nama;
        document.getElementById('guestSidebarSiswa').textContent = siswa.nama;
        document.getElementById('guestSidebarKelas').textContent = 'Kelas ' + siswa.kelas;
        const profil = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
        if (profil.nama) document.getElementById('guestSidebarNama').textContent = profil.nama;
        showPage('pengunjung');
      }).catch(() => {
        sessionStorage.removeItem('sipay_auth');
        sessionStorage.removeItem('sipay_guest');
        document.getElementById('loginScreen').classList.remove('hidden');
      });
    } else {
      sessionStorage.removeItem('sipay_auth');
      sessionStorage.removeItem('sipay_guest');
      setTimeout(() => document.getElementById('loginUser').focus(), 150);
    }
  } else {
    setTimeout(() => document.getElementById('loginUser').focus(), 150);
  }
});

// ══════════════════════════════════════════
