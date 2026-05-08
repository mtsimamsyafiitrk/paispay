// ── SiPay · Profil Sekolah ──
// PROFIL MADRASAH
// ══════════════════════════════════════════
const DEFAULT_PROFIL = {
  nama: 'Madrasah Terpadu',
  alamat: 'Jl. Pendidikan Islam No. 1',
  kota: 'Tarakan',
  provinsi: 'Kalimantan Utara',
  telp: '(0551) 123456',
  email: 'admin@madrasah.sch.id',
  web: 'www.madrasah.sch.id',
  nsm: '',
  ta: '2025/2026',
  akreditasi: 'A',
  kepsek: 'HARMIN, S.Pd',
  kepsek_nip: '',
  bendahara: 'RUDDY HERMANTO',
  bendahara_nip: '',
};

function getProfil() {
  try { return JSON.parse(localStorage.getItem('sipay_profil') || 'null') || DEFAULT_PROFIL; }
  catch { return DEFAULT_PROFIL; }
}
function getLogo() {
  return localStorage.getItem('sipay_logo') || '';
}
function saveProfil() {
  const g = id => document.getElementById(id).value.trim();
  const p = {
    nama: g('pf_nama') || DEFAULT_PROFIL.nama,
    alamat: g('pf_alamat'), kota: g('pf_kota'), provinsi: g('pf_provinsi'),
    telp: g('pf_telp'), email: g('pf_email'), web: g('pf_web'), nsm: g('pf_nsm'),
    ta: g('pf_ta'), akreditasi: g('pf_akreditasi'),
    kepsek: g('pf_kepsek') || DEFAULT_PROFIL.kepsek,
    kepsek_nip: g('pf_kepsek_nip'),
    bendahara: g('pf_bendahara') || DEFAULT_PROFIL.bendahara,
    bendahara_nip: g('pf_bendahara_nip'),
  };
  localStorage.setItem('sipay_profil', JSON.stringify(p));
  applyProfil(p);
  saveSettings();
  closeProfilModal();
  toast('✅ Profil madrasah berhasil disimpan!');
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('⚠️ Ukuran file maksimal 2MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    localStorage.setItem('sipay_logo', dataUrl);
    applyLogoPreview(dataUrl);
    applyLogoEverywhere(dataUrl);
    saveSettings(); // sync logo ke Supabase
    toast('✅ Logo berhasil diupload!');
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  localStorage.removeItem('sipay_logo');
  applyLogoPreview('');
  applyLogoEverywhere('');
  document.getElementById('pf_logo_input').value = '';
  // Hapus logo dari Supabase
  sb('settings?key=eq.logo', 'DELETE', null, { 'Prefer': 'return=minimal' }).catch(()=>{});
  toast('🗑️ Logo dihapus');
}

function applyLogoPreview(dataUrl) {
  const prev = document.getElementById('pf_logo_preview');
  const removeBtn = document.getElementById('pf_logo_remove');
  if (!prev) return;
  if (dataUrl) {
    prev.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
    prev.style.borderStyle = 'solid';
    prev.style.borderColor = 'var(--primary-light)';
    if (removeBtn) removeBtn.style.display = 'inline-block';
  } else {
    prev.innerHTML = '🕌';
    prev.style.borderStyle = 'dashed';
    prev.style.borderColor = 'var(--border)';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function applyLogoEverywhere(dataUrl) {
  // Banner dashboard
  const bannerLogo = document.getElementById('bannerLogoWrap');
  if (bannerLogo) {
    bannerLogo.innerHTML = dataUrl
      ? `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`
      : '🕌';
  }
  // Sidebar
  const sidebarLogo = document.getElementById('sidebarLogoWrap');
  if (sidebarLogo) {
    sidebarLogo.innerHTML = dataUrl
      ? `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`
      : '🕌';
  }
}

function applyProfil(p) {
  if (!p) p = getProfil();
  const el = id => document.getElementById(id);
  if (el('profilNama')) el('profilNama').textContent = p.nama;
  if (el('profilAlamat')) el('profilAlamat').textContent = [p.alamat, p.kota, p.provinsi].filter(Boolean).join(', ');
  if (el('profilKontak')) el('profilKontak').innerHTML = [
    p.telp ? '📞 ' + p.telp : '',
    p.email ? '✉️ ' + p.email : '',
    p.ta ? '📅 TA ' + p.ta : ''
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const sn = document.querySelector('.sidebar-logo .school-name');
  if (sn) sn.innerHTML = p.nama.replace(/\s+/, '<br>');
  // Apply logo
  applyLogoEverywhere(getLogo());
}
function openProfilModal() {
  const p = getProfil();
  document.getElementById('pf_nama').value = p.nama;
  document.getElementById('pf_alamat').value = p.alamat;
  document.getElementById('pf_kota').value = p.kota;
  document.getElementById('pf_provinsi').value = p.provinsi;
  document.getElementById('pf_telp').value = p.telp;
  document.getElementById('pf_email').value = p.email;
  document.getElementById('pf_web').value = p.web || '';
  document.getElementById('pf_nsm').value = p.nsm || '';
  document.getElementById('pf_ta').value = p.ta;
  document.getElementById('pf_akreditasi').value = p.akreditasi || '';
  document.getElementById('pf_kepsek').value = p.kepsek;
  document.getElementById('pf_kepsek_nip').value = p.kepsek_nip || '';
  document.getElementById('pf_bendahara').value = p.bendahara;
  document.getElementById('pf_bendahara_nip').value = p.bendahara_nip || '';
  // Show current logo in preview
  applyLogoPreview(getLogo());
  document.getElementById('profilModal').classList.add('open');
}
function closeProfilModal() { document.getElementById('profilModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ══════════════════════════════════════════
