// ── SiPay · Auth & Login ──
// ══════════════════════════════════════════
// AUTH / LOGIN
// ══════════════════════════════════════════
// Kredensial admin kini di Supabase Auth (bukan localStorage). DEFAULT_ADMIN
// hanya menyediakan label nama untuk UI sebelum profil termuat.
const DEFAULT_ADMIN = { user: 'Admin' };

function getAdminCreds() {
  try { return JSON.parse(localStorage.getItem('sipay_admin') || 'null') || DEFAULT_ADMIN; }
  catch { return DEFAULT_ADMIN; }
}
// Login admin = punya sesi Supabase Auth yang valid (ditegakkan server via RLS),
// bukan sekadar penanda di localStorage.
function isLoggedIn() {
  return hasAdminSession();
}
function showLoginError(msg) {
  const err = document.getElementById('loginError');
  err.textContent = '⚠️ ' + msg;
  err.style.display = 'block';
  setTimeout(() => err.style.display = 'none', 4000);
}

// Login admin via Supabase Auth (email + password).
async function doLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) { showLoginError('Email & password wajib diisi'); return; }

  const btn = document.querySelector('#loginFormAdmin .login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    const sess = await sbSignIn(email, pass);
    const label = (sess.user && sess.user.email) ? sess.user.email : email;
    localStorage.setItem('sipay_admin', JSON.stringify({ user: label }));
    localStorage.setItem('sipay_auth', 'admin'); // penanda UI (otoritas ada di token)
    localStorage.removeItem('sipay_guest');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = label;
    // Muat ulang data dengan hak akses admin (token kini terpasang di sb())
    try { await loadDataForTA(); } catch { /* biarkan; UI tetap tampil */ }
    showPage('dashboard');
  } catch (e) {
    showLoginError('Email atau password salah');
    document.getElementById('loginPass').value = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk sebagai Admin'; }
  }
}
// ══════════════════════════════════════════
