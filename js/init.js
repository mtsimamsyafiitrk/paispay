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
  applyProfil();
  await initApp();

  // Restore sesi setelah data dimuat
  if (isLoggedIn()) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    showPage('dashboard');
  } else if (isGuest()) {
    const g = JSON.parse(localStorage.getItem('sipay_guest') || '{}');
    if (g.nama) {
      document.getElementById('loginScreen').classList.add('hidden');
      try {
        const [allSiswa, txns] = await Promise.all([
          sb('students?select=*&nama=eq.' + encodeURIComponent(g.nama)),
          sb('transactions?select=*&nama=eq.' + encodeURIComponent(g.nama) + '&order=created_at.desc'),
        ]);
        if (!allSiswa.length) throw new Error('Santri tidak ditemukan');
        const siswa = allSiswa[0];
        siswa.spp_paid_months = Array.isArray(siswa.spp_paid_months) ? siswa.spp_paid_months : [];
        guestData = { siswa, txns };
        document.getElementById('adminLabel').textContent = siswa.nama;
        document.getElementById('guestSidebarSiswa').textContent = siswa.nama;
        document.getElementById('guestSidebarKelas').textContent = 'Kelas ' + siswa.kelas;
        const profil = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
        if (profil.nama) document.getElementById('guestSidebarNama').textContent = profil.nama;
        renderGuestPage();
        showPage('pengunjung');
      } catch {
        localStorage.removeItem('sipay_auth');
        localStorage.removeItem('sipay_guest');
        document.getElementById('loginScreen').classList.remove('hidden');
        setTimeout(() => document.getElementById('loginUser').focus(), 150);
      }
    } else {
      localStorage.removeItem('sipay_auth');
      localStorage.removeItem('sipay_guest');
      setTimeout(() => document.getElementById('loginUser').focus(), 150);
    }
  } else {
    setTimeout(() => document.getElementById('loginUser').focus(), 150);
  }
});

