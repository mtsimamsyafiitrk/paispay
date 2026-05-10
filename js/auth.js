// ── SiPay · Auth & Login ──
// ══════════════════════════════════════════
// AUTH / LOGIN
// ══════════════════════════════════════════
const DEFAULT_ADMIN = { user: 'admin', pass: 'sipay123' };

function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem('sipay_admin') || 'null') || DEFAULT_ADMIN; }
  catch { return DEFAULT_ADMIN; }
}
function isLoggedIn() {
  return localStorage.getItem('sipay_auth') === 'admin';
}function switchLoginMode(mode) {
  document.getElementById('tabAdmin').classList.toggle('active', mode === 'admin');
  document.getElementById('tabGuest').classList.toggle('active', mode === 'guest');
  document.getElementById('loginFormAdmin').style.display = mode === 'admin' ? 'block' : 'none';
  document.getElementById('loginFormGuest').style.display = mode === 'guest' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
  if (mode === 'guest') initGuestLogin();
}
// ── Reset credentials via OTP (dari halaman login) ──
function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const creds = getAdminCreds();
  if (u === creds.user && p === creds.pass) {
    localStorage.setItem('sipay_auth', 'admin');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = u;
    showPage('dashboard');
  } else {
    const err = document.getElementById('loginError');
    err.style.display = 'block';
    document.getElementById('loginPass').value = '';
    setTimeout(() => err.style.display = 'none', 3000);
  }
}
// ══════════════════════════════════════════
