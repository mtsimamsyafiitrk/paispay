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
  setIconText(err, '⚠️ ' + msg);
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
    // Akun yang tidak ada di daftar admin (mis. hasil pendaftaran publik) ditolak
    // di sini supaya tidak melihat layar kosong. Penjaga utamanya tetap RLS server.
    let admin = true;
    try { admin = (await sb('rpc/is_admin', 'POST', {})) !== false; } catch { /* migrasi belum dijalankan */ }
    if (!admin) {
      await sbSignOut();
      showLoginError('Akun ini belum terdaftar sebagai admin SiPay');
      document.getElementById('loginPass').value = '';
      return;
    }
    const label = (sess.user && sess.user.email) ? sess.user.email : email;
    localStorage.setItem('sipay_admin', JSON.stringify({ user: label }));
    localStorage.setItem('sipay_auth', 'admin'); // penanda UI (otoritas ada di token)
    localStorage.removeItem('sipay_guest');
    await muatPeran();
    document.getElementById('loginScreen').classList.add('hidden');
    terapkanPeran();
    // Muat ulang data dengan hak akses admin (token kini terpasang di sb())
    try { await loadDataForTA(); } catch { /* biarkan; UI tetap tampil */ }
    startAutoSync(); // jaga layar tetap pada kondisi data terakhir
    showPage('dashboard');
  } catch (e) {
    showLoginError('Email atau password salah');
    document.getElementById('loginPass').value = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// PERAN AKUN: 'admin' (semua fitur) | 'petugas' (input pembayaran, kuitansi,
// Buku Induk, lihat & cetak). Batasan sesungguhnya ditegakkan SERVER
// (supabase_migration_peran.sql); di sini hanya menyesuaikan tampilan.
// ══════════════════════════════════════════
function getPeran()     { return localStorage.getItem('sipay_peran') === 'petugas' ? 'petugas' : 'admin'; }
function isAdminPenuh() { return getPeran() === 'admin'; }
const HALAMAN_ADMIN = ['pengaturan', 'template-kuitansi'];

function terapkanPeran() {
  const petugas = !isAdminPenuh();
  document.documentElement.classList.toggle('peran-petugas', petugas);
  const lbl = document.getElementById('adminLabel');
  if (lbl) lbl.textContent = getAdminCreds().user + (petugas ? ' · Petugas' : '');
  if (petugas && HALAMAN_ADMIN.includes(activePageId())) showPage('dashboard');
}

// Ambil peran dari server. Gagal (offline) → pakai peran terakhir; belum pernah
// ada (mis. migrasi peran belum dijalankan) → admin, seperti sebelum ada peran.
async function muatPeran() {
  try {
    const r = await sb('rpc/peran_saya', 'POST', {});
    localStorage.setItem('sipay_peran', r === 'petugas' ? 'petugas' : 'admin');
  } catch { /* tetap pakai nilai tersimpan */ }
  terapkanPeran();
}
