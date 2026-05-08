// ── SiPay · App Initialization ──
// Load XLSX lib dynamically for import
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  document.head.appendChild(s);
})();

function isGuest() {
  return sessionStorage.getItem('sipay_auth') === 'guest';
}

document.addEventListener('DOMContentLoaded', () => {
  // Modal click-outside listeners
  document.getElementById('detailModal').addEventListener('click', function(e) { if(e.target===this) closeModal(); });
  document.getElementById('profilModal').addEventListener('click', function(e) { if(e.target===this) closeProfilModal(); });
  document.getElementById('deleteModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  document.getElementById('addSiswaModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  applyProfil();
  initApp();
});

