// ── SiPay · Template Kuitansi ──
// TEMPLATE KUITANSI
// ══════════════════════════════════════════
const KT_DEFAULT = {
  nama: '', alamat: '', kontak: '',
  warna: '#1e5631', fontsize: '11', judul: 'KUITANSI PEMBAYARAN', prefix: 'KWT',
  show_logo: true, show_nisn: true, show_nokwt: true,
  show_terbilang: true, show_ttd: true, show_catatan: true,
  ttd_kiri: 'Bendahara / Admin', ttd_kanan: '',
  use_ttd_online: false, ttd_online_img: '',
  footer: '',
};
let ktData = { ...KT_DEFAULT };

async function loadTemplateKuitansi() {
  try {
    const rows = await sb('settings?select=*&key=eq.kuitansi_template');
    if (rows.length && rows[0].value) {
      ktData = { ...KT_DEFAULT, ...rows[0].value };
    }
  } catch(e) { console.warn('loadTemplateKuitansi:', e.message); }
}

async function saveTemplateKuitansi() {
  // Baca dari form
  ktData = {
    nama:           document.getElementById('kt_nama').value.trim(),
    alamat:         document.getElementById('kt_alamat').value.trim(),
    kontak:         document.getElementById('kt_kontak').value.trim(),
    warna:          document.getElementById('kt_warna').value,
    fontsize:       document.getElementById('kt_fontsize').value,
    judul:          document.getElementById('kt_judul').value.trim() || 'KUITANSI PEMBAYARAN',
    prefix:         (document.getElementById('kt_prefix').value.trim() || 'KWT').toUpperCase(),
    show_logo:      document.getElementById('kt_show_logo').checked,
    show_nisn:      document.getElementById('kt_show_nisn').checked,
    show_nokwt:     document.getElementById('kt_show_nokwt').checked,
    show_terbilang: document.getElementById('kt_show_terbilang').checked,
    show_ttd:       document.getElementById('kt_show_ttd').checked,
    show_catatan:   document.getElementById('kt_show_catatan').checked,
    ttd_kiri:       document.getElementById('kt_ttd_kiri').value.trim(),
    ttd_kanan:      document.getElementById('kt_ttd_kanan').value.trim(),
    use_ttd_online: document.getElementById('kt_use_ttd_online').checked,
    ttd_online_img: document.getElementById('kt_use_ttd_online').checked ? (ktData.ttd_online_img || '') : '',
    footer:         document.getElementById('kt_footer').value.trim(),
  };
  const statusEl = document.getElementById('kt_saveStatus');
  statusEl.textContent = '⏳ Menyimpan...';
  try {
    await sb('settings?on_conflict=key', 'POST',
      [{ key: 'kuitansi_template', value: ktData }],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    statusEl.textContent = '✅ Template berhasil disimpan!';
    setTimeout(() => statusEl.textContent = '', 3000);
    toast('✅ Template kuitansi disimpan!');
    renderKTPreview();
  } catch(e) {
    statusEl.textContent = '❌ Gagal: ' + e.message;
  }
}

function resetTemplateKuitansi() {
  if (!confirm('Reset ke template default? Semua pengaturan akan kembali ke bawaan.')) return;
  ktData = { ...KT_DEFAULT };
  isiFormKT();
  renderKTPreview();
}

function isiFormKT() {
  document.getElementById('kt_nama').value        = ktData.nama || '';
  document.getElementById('kt_alamat').value      = ktData.alamat || '';
  document.getElementById('kt_kontak').value      = ktData.kontak || '';
  document.getElementById('kt_warna').value       = ktData.warna || '#1e5631';
  document.getElementById('kt_warna_hex').value   = ktData.warna || '#1e5631';
  document.getElementById('kt_fontsize').value    = ktData.fontsize || '11';
  document.getElementById('kt_judul').value       = ktData.judul || 'KUITANSI PEMBAYARAN';
  document.getElementById('kt_prefix').value      = ktData.prefix || 'KWT';
  document.getElementById('kt_show_logo').checked      = ktData.show_logo !== false;
  document.getElementById('kt_show_nisn').checked      = ktData.show_nisn !== false;
  document.getElementById('kt_show_nokwt').checked     = ktData.show_nokwt !== false;
  document.getElementById('kt_show_terbilang').checked = ktData.show_terbilang !== false;
  document.getElementById('kt_show_ttd').checked       = ktData.show_ttd !== false;
  document.getElementById('kt_show_catatan').checked   = ktData.show_catatan !== false;
  document.getElementById('kt_ttd_kiri').value    = ktData.ttd_kiri || '';
  document.getElementById('kt_ttd_kanan').value   = ktData.ttd_kanan || '';
  document.getElementById('kt_use_ttd_online').checked = ktData.use_ttd_online || false;
  toggleTTDOnline();
  if (ktData.ttd_online_img) {
    const prev = document.getElementById('kt_ttd_preview');
    if (prev) prev.innerHTML = `<img src="${ktData.ttd_online_img}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
    const hapusBtn = document.getElementById('kt_ttd_hapus');
    if (hapusBtn) hapusBtn.style.display = 'inline-flex';
  }
  document.getElementById('kt_footer').value      = ktData.footer || '';
}

function syncColorHex() {
  const hex = document.getElementById('kt_warna_hex').value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('kt_warna').value = hex;
  }
  renderKTPreview();
}

// Auto preview on any change
function initKTListeners() {
  ['kt_nama','kt_alamat','kt_kontak','kt_warna_hex','kt_fontsize','kt_judul','kt_prefix',
   'kt_ttd_kiri','kt_ttd_kanan','kt_footer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderKTPreview);
  });
  document.getElementById('kt_warna').addEventListener('input', function() {
    document.getElementById('kt_warna_hex').value = this.value;
    renderKTPreview();
  });
  ['kt_show_logo','kt_show_nisn','kt_show_nokwt','kt_show_terbilang',
   'kt_show_ttd','kt_show_catatan'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderKTPreview);
  });
}

function getKTFromForm() {
  return {
    nama:           document.getElementById('kt_nama')?.value?.trim() || '',
    alamat:         document.getElementById('kt_alamat')?.value?.trim() || '',
    kontak:         document.getElementById('kt_kontak')?.value?.trim() || '',
    warna:          document.getElementById('kt_warna')?.value || '#1e5631',
    fontsize:       document.getElementById('kt_fontsize')?.value || '11',
    judul:          document.getElementById('kt_judul')?.value?.trim() || 'KUITANSI PEMBAYARAN',
    prefix:         (document.getElementById('kt_prefix')?.value?.trim() || 'KWT').toUpperCase(),
    show_logo:      document.getElementById('kt_show_logo')?.checked ?? true,
    show_nisn:      document.getElementById('kt_show_nisn')?.checked ?? true,
    show_nokwt:     document.getElementById('kt_show_nokwt')?.checked ?? true,
    show_terbilang: document.getElementById('kt_show_terbilang')?.checked ?? true,
    show_ttd:       document.getElementById('kt_show_ttd')?.checked ?? true,
    show_catatan:   document.getElementById('kt_show_catatan')?.checked ?? true,
    ttd_kiri:       document.getElementById('kt_ttd_kiri')?.value?.trim() || '',
    ttd_kanan:      document.getElementById('kt_ttd_kanan')?.value?.trim() || '',
    use_ttd_online: document.getElementById('kt_use_ttd_online')?.checked || false,
    ttd_online_img: (document.getElementById('kt_use_ttd_online')?.checked) ? (ktData.ttd_online_img || '') : '',
    footer:         document.getElementById('kt_footer')?.value?.trim() || '',
  };
}

function toggleTTDOnline() {
  const checked = document.getElementById('kt_use_ttd_online')?.checked;
  const area = document.getElementById('kt_ttd_online_area');
  if (area) area.style.display = checked ? 'block' : 'none';
  renderKTPreview();
}

function previewTTDOnline(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 1 * 1024 * 1024) { toast('⚠️ Ukuran TTD maksimal 1MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    ktData.ttd_online_img = e.target.result;
    const prev = document.getElementById('kt_ttd_preview');
    if (prev) {
      prev.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
      prev.style.borderStyle = 'solid';
      prev.style.borderColor = 'var(--primary-light)';
    }
    const hapusBtn = document.getElementById('kt_ttd_hapus');
    if (hapusBtn) hapusBtn.style.display = 'inline-flex';
    renderKTPreview();
  };
  reader.readAsDataURL(file);
}

function hapusTTDOnline() {
  ktData.ttd_online_img = '';
  const prev = document.getElementById('kt_ttd_preview');
  if (prev) {
    prev.innerHTML = '<span style="font-size:12px;color:var(--text-muted);text-align:center;">✍️ Klik upload<br>gambar TTD</span>';
    prev.style.borderStyle = 'dashed';
    prev.style.borderColor = 'var(--border)';
  }
  const hapusBtn = document.getElementById('kt_ttd_hapus');
  if (hapusBtn) hapusBtn.style.display = 'none';
  document.getElementById('kt_ttd_input').value = '';
  renderKTPreview();
}

// Generate nomor kuitansi: PREFIX-MMYYYY-XXXX (auto-increment, reset tiap bulan)
async function generateNoKuitansi() {
  const now    = new Date();
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy   = now.getFullYear();
  const bulan  = mm + yyyy; // misal: 032026
  const prefix = (ktData.prefix || 'KWT').toUpperCase();
  const pattern = prefix + '-' + bulan + '-';

  try {
    // Ambil nomor terakhir bulan ini dari Supabase
    // Supabase REST: ilike untuk case-insensitive, * sebagai wildcard
    const rows = await sb(
      'kuitansi?select=no_kuitansi&no_kuitansi=ilike.' + pattern + '*&order=no_kuitansi.desc&limit=1'
    );
    let urutan = 1;
    if (rows.length) {
      const last = rows[0].no_kuitansi; // misal KWT-032026-0012
      const parts = last.split('-');
      const lastNum = parseInt(parts[parts.length - 1]) || 0;
      urutan = lastNum + 1;
    }
    return pattern + String(urutan).padStart(4, '0');
  } catch {
    // Fallback jika Supabase belum siap
    return pattern + String(Date.now()).slice(-4);
  }
}

function renderKTPreview() {
  const el = document.getElementById('kt_preview');
  if (!el) return;
  const kt = getKTFromForm();
  // Pakai data siswa pertama yang ada, atau data contoh
  const siswaContoh = appState.students[0] || null;
  const prefix = kt.prefix || 'KWT';
  const now = new Date();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const noContoh = `${prefix}-${mm}${now.getFullYear()}-0001`;
  const contoh = {
    nama:    siswaContoh ? siswaContoh.nama  : 'Nama Santri Contoh',
    kelas:   siswaContoh ? siswaContoh.kelas : '—',
    nisn:    siswaContoh ? (siswaContoh.nisn || '—') : '—',
    items:   [{ name: 'SPP', amount: siswaContoh ? siswaContoh.spp||250000 : 250000, bulan: 'Jan' },
              { name: 'Uang Pangkal', amount: 500000, bulan: null }],
    total:   siswaContoh ? (siswaContoh.spp||250000) + 500000 : 750000,
    time:    new Date().toLocaleDateString('id-ID') + ' 08:30',
    catatan: 'Pembayaran bulan Januari',
    no_kuitansi: noContoh,
  };
  el.innerHTML = buildKuitansiHTML(contoh, kt, 'Lembar Pembayar');
}

// ── Builder kuitansi HTML (dipakai preview & cetak) ──
function buildKuitansiHTML(data, kt, label) {
  const profil   = JSON.parse(localStorage.getItem('sipay_profil') || '{}');
  const logoB64  = localStorage.getItem('sipay_logo') || '';
  const w        = kt.warna || '#1e5631';
  const fs       = Number(kt.fontsize || 11);
  const namaLbg  = kt.nama  || profil.nama    || 'Madrasah Terpadu';
  const alamatLbg = kt.alamat || profil.alamat || '';
  const kontakLbg = kt.kontak || profil.kontak || '';
  const fmt      = n => Number(n||0).toLocaleString('id-ID');
  // Pakai no_kuitansi yang sudah di-generate, fallback ke format lama
  const noKwt     = data.no_kuitansi || data._noKwt || ((kt.prefix||'KWT') + '-' + Date.now().toString().slice(-6));
  const isKoreksi = !!data.is_koreksi;
  const warnaBorder = isKoreksi ? '#b45309' : w;

  const logoHtml = (kt.show_logo && logoB64)
    ? `<img src="${logoB64}" style="width:52px;height:52px;object-fit:contain;">`
    : (kt.show_logo ? `<div style="width:52px;height:52px;background:#e8f5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🕌</div>` : '');

  const itemRows = data.items.map(i => {
    const dibatalkan = i._dibatalkan || (i._tipe === 'batalkan');
    const dikoreksi  = i._koreksi || i._tipe === 'koreksi_nilai';
    const rowStyle   = dibatalkan ? 'color:#dc2626;' : dikoreksi ? 'color:#b45309;font-weight:600;' : '';
    const badge      = dibatalkan
      ? ' <span style="font-size:9px;background:#fef2f2;color:#dc2626;padding:1px 5px;border-radius:3px;font-family:sans-serif;">DIBATALKAN</span>'
      : dikoreksi
      ? ' <span style="font-size:9px;background:#fef9c3;color:#b45309;padding:1px 5px;border-radius:3px;font-family:sans-serif;">KOREKSI</span>' : '';
    const namaItem = i.name + (i.bulan && !i.name.includes('(') ? ' (' + (MONTH_FULL[i.bulan]||i.bulan) + ')' : '');
    return `<tr style="${rowStyle}">
      <td style="padding:4px 8px;border:1px solid #ddd;font-size:${fs}px;">${namaItem}${badge}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-size:${fs}px;">${dibatalkan ? '<s>Rp '+fmt(i.amount)+'</s>' : 'Rp '+fmt(i.amount)}</td>
    </tr>`;
  }).join('');

  // TTD section
  let ttdHtml = '';
  if (kt.show_ttd) {
    const kiri  = kt.ttd_kiri  || 'Bendahara / Admin';
    const kanan = kt.ttd_kanan || '';
    const ttdImgHtml = (kt.use_ttd_online && kt.ttd_online_img)
      ? `<img src="${kt.ttd_online_img}" style="height:40px;max-width:130px;object-fit:contain;display:block;margin:0 auto;">`
      : `<div style="height:40px;"></div>`;

    const blokKiri = `<div style="min-width:130px;text-align:center;">
      <div style="margin-bottom:4px;">${kiri}</div>
      ${ttdImgHtml}
      <div style="border-bottom:1.5px solid #333;width:130px;margin:0 auto;"></div>
      <div style="margin-top:4px;font-size:${fs-1}px;color:#555;">(Tanda Tangan)</div>
    </div>`;

    const blokKanan = kanan ? `<div style="min-width:130px;text-align:center;">
      <div style="margin-bottom:4px;">${kanan}</div>
      <div style="height:40px;"></div>
      <div style="border-bottom:1.5px solid #333;width:130px;margin:0 auto;"></div>
      <div style="margin-top:4px;font-size:${fs-1}px;color:#555;">(Tanda Tangan)</div>
    </div>` : '';

    ttdHtml = `<div style="display:flex;justify-content:${kanan ? 'space-between' : 'flex-end'};font-size:${fs}px;margin-top:10px;">
      ${kanan ? blokKiri : ''}
      ${kanan ? blokKanan : blokKiri}
    </div>`;
  }

  return `
  <div style="width:100%;border:2px solid ${warnaBorder};border-radius:8px;padding:12px 16px;font-family:'Times New Roman',serif;box-sizing:border-box;background:#fff;">
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid ${warnaBorder};padding-bottom:8px;margin-bottom:8px;">
      ${logoHtml}
      <div style="flex:1;text-align:center;">
        <div style="font-size:${fs+4}px;font-weight:700;color:${warnaBorder};">${namaLbg}</div>
        ${alamatLbg ? `<div style="font-size:${fs-1}px;color:#555;">${alamatLbg}</div>` : ''}
        ${kontakLbg ? `<div style="font-size:${fs-1}px;color:#555;">${kontakLbg}</div>` : ''}
      </div>
      <div style="text-align:right;min-width:80px;">
        <span style="background:${warnaBorder};color:#fff;padding:3px 8px;border-radius:4px;font-size:${fs-1}px;font-weight:700;">${label}</span>
      </div>
    </div>

    <!-- Judul -->
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:${fs+2}px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${warnaBorder};">
        ${isKoreksi ? 'KUITANSI KOREKSI' : kt.judul}
      </div>
      ${isKoreksi && data.ref_no_kuitansi ? `<div style="font-size:${fs-1}px;color:#b45309;margin-top:3px;font-family:sans-serif;">📋 Koreksi atas Kuitansi No. <strong>${data.ref_no_kuitansi}</strong></div>` : ''}
    </div>

    <!-- Info -->
    <table style="width:100%;font-size:${fs}px;margin-bottom:8px;border-collapse:collapse;">
      ${kt.show_nokwt ? `<tr><td style="width:28%;padding:2px 0;">No. Kuitansi</td><td style="width:2%">:</td><td style="font-weight:700;">${noKwt}</td><td style="width:24%;text-align:right;">Tanggal</td><td style="width:2%">:</td><td style="font-weight:700;">${data.time}</td></tr>` : `<tr><td colspan="6" style="text-align:right;padding:2px 0;font-size:${fs-1}px;color:#666;">Tanggal: ${data.time}</td></tr>`}
      <tr><td style="padding:2px 0;">Nama Santri</td><td>:</td><td style="font-weight:700;" colspan="4">${data.nama}</td></tr>
      <tr><td style="padding:2px 0;">Kelas</td><td>:</td><td colspan="4">${data.kelas}${kt.show_nisn && data.nisn ? ' &nbsp;|&nbsp; NISN: ' + data.nisn : ''}</td></tr>
      ${kt.show_catatan && data.catatan ? `<tr><td style="padding:2px 0;">Keterangan</td><td>:</td><td colspan="4" style="font-style:italic;">${data.catatan}</td></tr>` : ''}
    </table>

    <!-- Item -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
      <thead><tr style="background:${warnaBorder};color:#fff;">
        <th style="padding:5px 8px;border:1px solid ${warnaBorder};text-align:left;font-size:${fs}px;">Rincian Pembayaran</th>
        <th style="padding:5px 8px;border:1px solid ${warnaBorder};text-align:right;font-size:${fs}px;">Nominal</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr style="background:${isKoreksi?'#fef9c3':'#f0f7f0'};font-weight:700;">
        <td style="padding:5px 8px;border:1px solid #ddd;font-size:${fs}px;">TOTAL</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-size:${fs+1}px;color:${warnaBorder};">Rp ${fmt(data.total)}</td>
      </tr></tfoot>
    </table>

    ${kt.show_terbilang ? `<div style="background:#f9f9f9;border:1px dashed #ccc;border-radius:5px;padding:5px 8px;font-size:${fs-1}px;margin-bottom:8px;"><strong>Terbilang:</strong> <em>${terbilangFull(data.total)}</em></div>` : ''}

    ${ttdHtml}

    ${kt.footer ? `<div style="margin-top:8px;text-align:center;font-size:${fs-1}px;color:#888;border-top:1px solid #eee;padding-top:6px;">${kt.footer}</div>` : ''}
  </div>`;
}

// Render halaman template kuitansi
async function renderTemplateKuitansiPage() {
  await loadTemplateKuitansi();
  // Tunggu DOM siap (halaman baru saja di-show)
  setTimeout(() => {
    isiFormKT();
    initKTListeners();
    renderKTPreview();
  }, 50);
}
const SB_STORAGE_URL = SB_URL + '/storage/v1/object/public/bukti-pembayaran/';
const SB_UPLOAD_URL  = SB_URL + '/storage/v1/object/bukti-pembayaran/';
let laporanFilter = 'pending';
let laporBuktiFile = null;

// ── Render halaman lapor (wali) ──
