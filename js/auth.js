// ── SiPay · Auth & Login ──
// ══════════════════════════════════════════
// AUTH / LOGIN
// ══════════════════════════════════════════
// Login admin kini ditangani Supabase Auth (JWT), bukan kredensial lokal.
function isLoggedIn() {
  return !!sbAuthToken;
}
function getAdminEmail() {
  return localStorage.getItem('sipay_admin_email') || 'Admin';
}
function switchLoginMode(mode) {
  document.getElementById('tabAdmin').classList.toggle('active', mode === 'admin');
  document.getElementById('tabGuest').classList.toggle('active', mode === 'guest');
  document.getElementById('loginFormAdmin').style.display = mode === 'admin' ? 'block' : 'none';
  document.getElementById('loginFormGuest').style.display = mode === 'guest' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
  if (mode === 'guest') initGuestLogin();
}
async function doLogin() {
  const email = document.getElementById('loginUser').value.trim();
  const p     = document.getElementById('loginPass').value;
  const err   = document.getElementById('loginError');
  const btn   = document.querySelector('#loginFormAdmin .login-btn');
  if (!email || !p) { err.textContent = 'Isi email & password.'; err.style.display = 'block'; setTimeout(()=>err.style.display='none',3000); return; }
  if (btn) { btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = '⏳ Memproses...'; }
  try {
    const r = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ email, password: p }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) throw new Error(data.error_description || data.msg || 'Login gagal');
    saveSession(data);
    if (data.user?.email) localStorage.setItem('sipay_admin_email', data.user.email);
    localStorage.setItem('sipay_auth', 'admin');
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminEmail();
    await initApp();
    showPage('dashboard');
  } catch(e) {
    err.textContent = /invalid/i.test(e.message) ? 'Email atau password salah.' : ('Gagal login: ' + e.message);
    err.style.display = 'block';
    document.getElementById('loginPass').value = '';
    setTimeout(() => err.style.display = 'none', 4000);
  } finally {
    if (btn) { btn.disabled = false; if (btn.dataset.txt) btn.textContent = btn.dataset.txt; }
  }
}
// ══════════════════════════════════════════
