// ── SiPay · App Initialization ──
// Load XLSX lib dynamically for import
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  document.head.appendChild(s);
})();

function isGuest() {
  return localStorage.getItem('sipay_auth') === 'guest';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Modal click-outside listeners
  document.getElementById('detailModal').addEventListener('click', function(e) { if(e.target===this) closeModal(); });
  document.getElementById('profilModal').addEventListener('click', function(e) { if(e.target===this) closeProfilModal(); });
  document.getElementById('deleteModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('addSiswaModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('indukDetailModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('biManualModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('biMassalModal')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  applyProfil();
  await initApp();

  // Restore sesi setelah data dimuat
  // Refresh token bila hampir/kadung kadaluarsa sebelum memutuskan status login.
  if (hasAdminSession() && sbSession.expires_at && Date.now() > sbSession.expires_at - 60000) {
    await sbRefresh();
  }
  if (isLoggedIn()) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    showPage('dashboard');
  } else {
    // Bersihkan sisa penanda sesi lama (termasuk mode wali yang telah dihapus)
    localStorage.removeItem('sipay_auth');
    localStorage.removeItem('sipay_guest');
    setTimeout(() => document.getElementById('loginUser').focus(), 150);
  }
});

