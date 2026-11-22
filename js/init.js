// ── SiPay · App Initialization ──
// Pustaka Excel TIDAK lagi dimuat di sini. Lihat xlsxReady() di js/config.js:
// pustakanya ditarik saat menu Import/Export benar-benar dipakai.


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

  // Sudah login sebelumnya: langsung tampilkan Dashboard (masih kosong, ditandai
  // "memuat") alih-alih layar login selama data diambil. Data — termasuk
  // salinan lokal — tetap baru digambar setelah sesi terbukti sah di bawah.
  const main = document.querySelector('.main-content');
  const adaSesi = hasAdminSession();
  if (adaSesi) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    main.classList.add('app-loading');
    showPage('dashboard');
  }

  // Pastikan sesi masih sah SEBELUM data apa pun dimuat atau digambar.
  // Dulu urutannya terbalik — initApp() berjalan lebih dulu, sempat memulihkan
  // data santri dari cache dan menggambarnya, baru sesinya diperiksa.
  if (hasAdminSession() && sbSession.expires_at && Date.now() > sbSession.expires_at - 60000) {
    await sbRefresh();
  }
  // Sesi ditolak server saat diperbarui → kembali ke layar login sekarang juga.
  if (adaSesi && !hasAdminSession()) document.getElementById('loginScreen').classList.remove('hidden');

  await initApp();
  main.classList.remove('app-loading');

  if (isLoggedIn()) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('adminLabel').textContent = getAdminCreds().user;
    // Sinkron berkala + saat tab kembali aktif, supaya data yang diinput di
    // device lain langsung tampil tanpa perlu reload halaman.
    startAutoSync();
    showPage('dashboard');
  } else {
    // Bersihkan sisa penanda sesi lama (termasuk mode wali yang telah dihapus)
    localStorage.removeItem('sipay_auth');
    localStorage.removeItem('sipay_guest');
    // Tanpa sesi yang sah, jangan tinggalkan data apa pun di balik layar login.
    // Penjagaan ini menutup kasus token kadaluarsa: initApp() sempat berjalan
    // saat token masih ada, lalu sbRefresh() di atas gagal dan sesi dibuang —
    // salinan lokal yang terlanjur dimuat harus ikut dibersihkan.
    clearLocalData();
    document.getElementById('loginScreen').classList.remove('hidden');
    setTimeout(() => document.getElementById('loginUser').focus(), 150);
  }
});

