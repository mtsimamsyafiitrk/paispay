// ── SiPay · Template Kuitansi ──
// TEMPLATE KUITANSI
// ══════════════════════════════════════════
const KT_DEFAULT = {
  nama: '', alamat: '', kontak: '',
  warna: '#1e5631', warna_arsip: '#1d4ed8',
  fontsize: '11', judul: 'KUITANSI PEMBAYARAN', prefix: 'KWT',
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
    warna_arsip:    document.getElementById('kt_warna_arsip').value,
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
  document.getElementById('kt_warna_arsip').value     = ktData.warna_arsip || '#1d4ed8';
  document.getElementById('kt_warna_arsip_hex').value = ktData.warna_arsip || '#1d4ed8';
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
    if (prev) prev.innerHTML = `<img src="${ktData.ttd_online_img}" class="img-fit">`;
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

function syncColorHexArsip() {
  const hex = document.getElementById('kt_warna_arsip_hex').value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    document.getElementById('kt_warna_arsip').value = hex;
  }
  renderKTPreview();
}

// Auto preview on any change
function initKTListeners() {
  ['kt_nama','kt_alamat','kt_kontak','kt_warna_hex','kt_warna_arsip_hex','kt_fontsize','kt_judul','kt_prefix',
   'kt_ttd_kiri','kt_ttd_kanan','kt_footer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderKTPreview);
  });
  document.getElementById('kt_warna').addEventListener('input', function() {
    document.getElementById('kt_warna_hex').value = this.value;
    renderKTPreview();
  });
  document.getElementById('kt_warna_arsip')?.addEventListener('input', function() {
    document.getElementById('kt_warna_arsip_hex').value = this.value;
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
    warna_arsip:    document.getElementById('kt_warna_arsip')?.value || '#1d4ed8',
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
      prev.innerHTML = `<img src="${e.target.result}" class="img-fit">`;
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
    prev.innerHTML = '<span class="hint text-center">✍️ Klik upload<br>gambar TTD</span>';
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
    metode:  'tunai',
    dibayar_oleh: 'Orang Tua Santri',
    no_kuitansi: noContoh,
  };
  el.innerHTML = `<style>${KWT_CSS}</style>` + buildKuitansiHTML(contoh, kt, 'Lembar Pembayar')
    + '<div class="kwt-sep"></div>'
    + buildKuitansiHTML(contoh, kt, 'Lembar Arsip');
}

// Ubah warna hex jadi rgba dengan alpha tertentu (untuk latar tipis pembeda lembar)
function ktTint(hex, alpha) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
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

  // Warna pembeda: lembar pembayar pakai warna utama, lembar arsip pakai
  // warna arsip. Kuitansi koreksi tetap oranye pada kedua lembar.
  const isArsip     = /arsip/i.test(label || '');
  const wArsip      = kt.warna_arsip || '#1d4ed8';
  const warnaBorder = isKoreksi ? '#b45309' : (isArsip ? wArsip : w);
  const bgLembar    = isKoreksi ? '#fff' : ktTint(warnaBorder, 0.045);
  const bgTotal     = isKoreksi ? '#fef9c3' : ktTint(warnaBorder, 0.10);

  // Lembar arsip diberi kotak kosong 2 cm x 0,5 cm tepat di atas label
  // "LEMBAR ARSIP" (jarak 0,2 cm) untuk catatan tulis tangan petugas.
  const ruangArsipHtml = isArsip ? `<div class="k-arsip-box"></div>` : '';

  const logoHtml = (kt.show_logo && logoB64)
    ? `<img class="k-logo" src="${safeUrl(logoB64)}">`
    : (kt.show_logo ? `<div class="k-logo-ph">🕌</div>` : '');

  const itemRows = data.items.map(i => {
    const dibatalkan = i._dibatalkan || (i._tipe === 'batalkan');
    const dikoreksi  = i._koreksi || i._tipe === 'koreksi_nilai';
    const rowCls     = dibatalkan ? ' class="k-row-batal"' : dikoreksi ? ' class="k-row-koreksi"' : '';
    const badge      = dibatalkan
      ? ' <span class="k-badge k-badge-batal">DIBATALKAN</span>'
      : dikoreksi
      ? ' <span class="k-badge k-badge-koreksi">KOREKSI</span>' : '';
    const namaItem = i.name + (i.bulan && !i.name.includes('(') ? ' (' + (MONTH_FULL[i.bulan]||i.bulan) + ')' : '');
    return `<tr${rowCls}>
      <td class="k-cell">${esc(namaItem)}${badge}</td>
      <td class="k-cell k-num">${dibatalkan ? '<s>Rp '+fmt(i.amount)+'</s>' : 'Rp '+fmt(i.amount)}</td>
    </tr>`;
  }).join('');

  // TTD section
  let ttdHtml = '';
  if (kt.show_ttd) {
    const kiri  = kt.ttd_kiri  || 'Bendahara / Admin';
    const kanan = kt.ttd_kanan || '';
    const ttdImgHtml = (kt.use_ttd_online && kt.ttd_online_img)
      ? `<img class="k-ttd-img" src="${safeUrl(kt.ttd_online_img)}">`
      : `<div class="k-ttd-space"></div>`;
    const blok = (role, img) => `<div class="k-ttd-blok">
      <div class="k-ttd-role">${esc(role)}</div>
      ${img}
      <div class="k-ttd-line"></div>
      <div class="k-ttd-cap">(Tanda Tangan)</div>
    </div>`;
    const blokKiri  = blok(kiri, ttdImgHtml);
    const blokKanan = kanan ? blok(kanan, `<div class="k-ttd-space"></div>`) : '';

    ttdHtml = `<div class="k-ttd${kanan ? ' split' : ''}">
      ${kanan ? blokKiri : ''}
      ${kanan ? blokKanan : blokKiri}
    </div>`;
  }

  // Warna & ukuran huruf dari template dikirim lewat variabel CSS (lihat KWT_CSS)
  return `
  <div class="kwt" style="--kw:${warnaBorder};--kfs:${fs}px;--kbg:${bgLembar};--kbgt:${bgTotal};">
    <!-- Header -->
    <div class="k-head">
      ${logoHtml}
      <div class="k-head-mid">
        <div class="k-nama">${esc(namaLbg)}</div>
        ${alamatLbg ? `<div class="k-sub">${esc(alamatLbg)}</div>` : ''}
        ${kontakLbg ? `<div class="k-sub">${esc(kontakLbg)}</div>` : ''}
      </div>
      <div class="k-head-right">
        ${ruangArsipHtml}
        <span class="k-label">${label}</span>
      </div>
    </div>

    <!-- Judul -->
    <div class="k-judul-wrap">
      <div class="k-judul">
        ${isKoreksi ? 'KUITANSI KOREKSI' : esc(kt.judul)}
      </div>
      ${isKoreksi && data.ref_no_kuitansi ? `<div class="k-ref">📋 Koreksi atas Kuitansi No. <strong>${esc(data.ref_no_kuitansi)}</strong></div>` : ''}
    </div>

    <!-- Info -->
    <table class="k-info">
      ${kt.show_nokwt ? `<tr><td class="k-c-label">No. Kuitansi</td><td class="k-c-sep">:</td><td class="k-b">${esc(noKwt)}</td><td class="k-c-label2">Tanggal</td><td class="k-c-sep">:</td><td class="k-b">${esc(data.time)}</td></tr>` : `<tr><td colspan="6" class="k-tgl">Tanggal: ${esc(data.time)}</td></tr>`}
      <tr><td class="k-pad">Nama Santri</td><td>:</td><td class="k-b" colspan="4">${esc(data.nama)}</td></tr>
      <tr><td class="k-pad">Kelas</td><td>:</td><td colspan="4">${esc(data.kelas)}${kt.show_nisn && data.nisn ? ' &nbsp;|&nbsp; NISN: ' + esc(data.nisn) : ''}</td></tr>
      ${data.metode ? `<tr><td class="k-pad">Metode</td><td>:</td><td colspan="4">${data.metode === 'transfer' ? '🏦 Transfer' : '💵 Tunai'}${data.dibayar_oleh ? ' &nbsp;|&nbsp; Dibayar oleh: <strong>' + esc(data.dibayar_oleh) + '</strong>' : ''}</td></tr>` : (data.dibayar_oleh ? `<tr><td class="k-pad">Dibayar oleh</td><td>:</td><td colspan="4"><strong>${esc(data.dibayar_oleh)}</strong></td></tr>` : '')}
      ${kt.show_catatan && data.catatan ? `<tr><td class="k-pad">Keterangan</td><td>:</td><td colspan="4" class="k-i">${esc(data.catatan)}</td></tr>` : ''}
    </table>

    <!-- Item -->
    <table class="k-items">
      <thead><tr class="k-items-head">
        <th class="k-th">Rincian Pembayaran</th>
        <th class="k-th k-num">Nominal</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr class="k-total">
        <td class="k-tcell">TOTAL</td>
        <td class="k-tcell k-num k-tamt">Rp ${fmt(data.total)}</td>
      </tr></tfoot>
    </table>

    ${kt.show_terbilang ? `<div class="k-terbilang"><strong>Terbilang:</strong> <em>${terbilangFull(data.total)}</em></div>` : ''}

    ${ttdHtml}

    ${kt.footer ? `<div class="k-footer">${esc(kt.footer)}</div>` : ''}
  </div>`;
}

// Gaya kuitansi — satu sumber untuk preview di aplikasi & jendela cetak
// (jendela cetak tidak memuat main.css). Selektor diawali .kwt supaya
// menang atas gaya tabel umum aplikasi saat dipreview.
const KWT_CSS = `
.kwt { width:100%; border:2px solid var(--kw); border-radius:8px; padding:12px 16px; font-family:'Times New Roman',serif; box-sizing:border-box; background:var(--kbg); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.kwt .k-head { display:flex; align-items:center; gap:10px; border-bottom:2px solid var(--kw); padding-bottom:8px; margin-bottom:8px; }
.kwt .k-head-mid { flex:1; text-align:center; }
.kwt .k-head-right { text-align:right; min-width:80px; }
.kwt .k-logo { width:52px; height:52px; object-fit:contain; }
.kwt .k-logo-ph { width:52px; height:52px; background:#e8f5e9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0; }
.kwt .k-nama { font-size:calc(var(--kfs) + 4px); font-weight:700; color:var(--kw); }
.kwt .k-sub { font-size:calc(var(--kfs) - 1px); color:#555; }
.kwt .k-arsip-box { width:2cm; height:0.5cm; margin:0 0 0.2cm auto; border:1px solid #bbb; box-sizing:border-box; }
.kwt .k-label { background:var(--kw); color:#fff; padding:3px 8px; border-radius:4px; font-size:calc(var(--kfs) - 1px); font-weight:700; }
.kwt .k-judul-wrap { text-align:center; margin-bottom:8px; }
.kwt .k-judul { font-size:calc(var(--kfs) + 2px); font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--kw); }
.kwt .k-ref { font-size:calc(var(--kfs) - 1px); color:#b45309; margin-top:3px; font-family:sans-serif; }
.kwt .k-info { width:100%; font-size:var(--kfs); margin-bottom:8px; border-collapse:collapse; }
.kwt .k-c-label { width:28%; padding:2px 0; }
.kwt .k-c-sep { width:2%; }
.kwt .k-c-label2 { width:24%; text-align:right; }
.kwt .k-pad { padding:2px 0; }
.kwt .k-b { font-weight:700; }
.kwt .k-i { font-style:italic; }
.kwt .k-tgl { text-align:right; padding:2px 0; font-size:calc(var(--kfs) - 1px); color:#666; }
.kwt .k-items { width:100%; border-collapse:collapse; margin-bottom:6px; }
.kwt .k-items-head { background:var(--kw); color:#fff; }
.kwt .k-th { padding:5px 8px; border:1px solid var(--kw); text-align:left; font-size:var(--kfs); }
.kwt .k-cell { padding:4px 8px; border:1px solid #ddd; font-size:var(--kfs); }
.kwt .k-row-batal { color:#dc2626; }
.kwt .k-row-koreksi { color:#b45309; font-weight:600; }
.kwt .k-badge { font-size:9px; padding:1px 5px; border-radius:3px; font-family:sans-serif; }
.kwt .k-badge-batal { background:#fef2f2; color:#dc2626; }
.kwt .k-badge-koreksi { background:#fef9c3; color:#b45309; }
.kwt .k-total { background:var(--kbgt); font-weight:700; }
.kwt .k-tcell { padding:5px 8px; border:1px solid #ddd; font-size:var(--kfs); }
.kwt .k-num { text-align:right; }
.kwt .k-tamt { font-size:calc(var(--kfs) + 1px); color:var(--kw); }
.kwt .k-terbilang { background:#f9f9f9; border:1px dashed #ccc; border-radius:5px; padding:5px 8px; font-size:calc(var(--kfs) - 1px); margin-bottom:8px; }
.kwt .k-ttd { display:flex; justify-content:flex-end; font-size:var(--kfs); margin-top:10px; }
.kwt .k-ttd.split { justify-content:space-between; }
.kwt .k-ttd-blok { min-width:130px; text-align:center; }
.kwt .k-ttd-role { margin-bottom:4px; }
.kwt .k-ttd-img { height:40px; max-width:130px; object-fit:contain; display:block; margin:0 auto; }
.kwt .k-ttd-space { height:40px; }
.kwt .k-ttd-line { border-bottom:1.5px solid #333; width:130px; margin:0 auto; }
.kwt .k-ttd-cap { margin-top:4px; font-size:calc(var(--kfs) - 1px); color:#555; }
.kwt .k-footer { margin-top:8px; text-align:center; font-size:calc(var(--kfs) - 1px); color:#888; border-top:1px solid #eee; padding-top:6px; }
.kwt-sep { border-top:2px dashed #aaa; margin:10px 0; }
`;

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
