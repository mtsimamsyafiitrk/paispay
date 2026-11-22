// ── SiPay · Input Pembayaran ──
let inputNamaSuggIdx = -1;
// Daftar tunggakan SPP tahun ajaran sebelumnya untuk siswa terpilih (dari
// spp_history). Diisi ulang tiap kali renderPaymentItems dipanggil dengan siswa.
let inputPrevArrears = [];

function renderInputPage() {
  // Reset search field saat halaman dibuka
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('inputNama').value = '';
  const chk = document.getElementById('inputShowNonAktif');
  if (chk) chk.checked = false;
  hideInputNamaDropdown();
  resetPaymentMeta();
  clearCart();
  renderPaymentItems();
}

// ── Metadata pembayaran: tanggal & jam, metode, dibayar oleh ──
function _todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _nowHM() {
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function resetPaymentMeta() {
  const jam = document.getElementById('inputJam');
  if (jam) jam.value = _nowHM();
  setTglMode('today');   // juga mengisi tanggal = hari ini
  setMetode('tunai');
  const oleh = document.getElementById('inputDibayarOleh');
  if (oleh) oleh.value = '';
}

// Mode tanggal: 'today' (kunci ke hari ini) atau 'other' (bisa pilih tanggal lain).
function setTglMode(mode) {
  const todayBtn = document.getElementById('tglTodayBtn');
  const otherBtn = document.getElementById('tglOtherBtn');
  const tgl = document.getElementById('inputTanggal');
  if (todayBtn) todayBtn.classList.toggle('active', mode === 'today');
  if (otherBtn) otherBtn.classList.toggle('active', mode === 'other');
  if (tgl) {
    if (mode === 'today') { tgl.value = _todayISO(); tgl.disabled = true; }
    else { tgl.disabled = false; }
  }
}

// Bila admin mengubah tanggal ke selain hari ini, otomatis pindah ke mode 'other'.
function onInputTanggalChange() {
  const tgl = document.getElementById('inputTanggal');
  if (tgl && tgl.value && tgl.value !== _todayISO()) setTglMode('other');
}

function setMetode(m) {
  const hid = document.getElementById('inputMetode');
  if (hid) hid.value = m;
  const bt = document.getElementById('metodeTunaiBtn');
  const btr = document.getElementById('metodeTransferBtn');
  if (bt)  bt.classList.toggle('active', m === 'tunai');
  if (btr) btr.classList.toggle('active', m === 'transfer');
  const lbl = document.getElementById('dibayarOlehLabel');
  const inp = document.getElementById('inputDibayarOleh');
  if (m === 'transfer') {
    if (lbl) lbl.innerHTML = 'Dibayar oleh <span style="color:var(--text-muted);font-weight:400;">(pengirim transfer)</span>';
    if (inp) inp.placeholder = 'Nama pengirim transfer...';
  } else {
    if (lbl) lbl.innerHTML = 'Dibayar oleh <span style="color:var(--text-muted);font-weight:400;">(opsional)</span>';
    if (inp) inp.placeholder = 'Nama pembayar / penyetor...';
  }
}

// Rangkai string tampilan "DD/MM/YYYY HH:MM" dari input tanggal & jam.
function buildInputTimeStr() {
  const dVal = document.getElementById('inputTanggal')?.value; // YYYY-MM-DD
  const jVal = document.getElementById('inputJam')?.value;     // HH:MM
  const now = new Date();
  let dateObj = now;
  if (dVal) { const p = dVal.split('-').map(Number); dateObj = new Date(p[0], p[1]-1, p[2]); }
  const tglStr = dateObj.toLocaleDateString('id-ID');
  const jamStr = jVal || now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  return tglStr + ' ' + jamStr;
}

function getPaymentMeta() {
  return {
    metode: document.getElementById('inputMetode')?.value || 'tunai',
    dibayar_oleh: (document.getElementById('inputDibayarOleh')?.value || '').trim(),
  };
}

function onInputNamaSearch() {
  inputNamaSuggIdx = -1;
  const q = (document.getElementById('inputNamaSearch').value || '').toLowerCase().trim();
  const dd = document.getElementById('inputNamaDropdown');
  if (!dd) return;

  // Default: santri aktif + calon SPMB; centang toggle untuk tampilkan semua
  const showNonAktif = document.getElementById('inputShowNonAktif')?.checked;
  const isNonAktif = s => !!(s.status_kelulusan && s.status_kelulusan !== 'calon'); // lulus/pindah/keluar
  const base = showNonAktif
    ? appState.students
    : appState.students.filter(s => !isNonAktif(s));

  // Bila toggle dicentang tapi memang tak ada satu pun santri non-aktif,
  // jelaskan penyebabnya (bukan sekadar "tidak ditemukan").
  if (showNonAktif && !appState.students.some(isNonAktif)) {
    dd.innerHTML = `<div style="padding:14px 16px;font-size:12.5px;color:var(--text-muted);line-height:1.55;">
      Belum ada santri berstatus <strong>lulus / pindah / keluar</strong>.<br>
      Tandai dulu lewat menu <strong>Data Santri</strong> (pilih santri → ubah status)
      atau <strong>Promosi Kelas</strong>, lalu mereka akan muncul di sini.
    </div>`;
    dd.style.display = 'block';
    return;
  }

  let list = q
    ? base.filter(s =>
        s.nama.toLowerCase().includes(q) ||
        (s.nisn && s.nisn.includes(q)) ||
        s.kelas.includes(q)
      )
    : base;

  // Saat toggle non-aktif aktif, tampilkan santri non-aktif lebih dulu agar
  // langsung terlihat (tidak tenggelam di bawah daftar santri aktif / batas 15).
  if (showNonAktif) {
    list = [...list].sort((a, b) => (isNonAktif(b) ? 1 : 0) - (isNonAktif(a) ? 1 : 0));
  }

  if (!list.length) {
    dd.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--text-muted);">Tidak ditemukan</div>`;
    dd.style.display = 'block';
    return;
  }

  const tunggakBadge = s => {
    const tk = totalTunggakan(s);
    return tk > 0
      ? `<span style="font-size:12px;font-weight:700;color:var(--danger);background:var(--danger-pale);padding:2px 8px;border-radius:20px;">⚠️ ${rp(tk)}</span>`
      : `<span style="font-size:12px;font-weight:700;color:var(--primary-light);background:var(--primary-pale);padding:2px 8px;border-radius:20px;">✓ Lunas</span>`;
  };

  // Highlight karakter yang cocok (tiap potongan di-escape agar aman dari XSS)
  const highlight = (text, q) => {
    if (!q) return esc(text);
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) +
      `<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">${esc(text.slice(idx, idx+q.length))}</mark>` +
      esc(text.slice(idx + q.length));
  };

  dd.innerHTML = list.slice(0, 15).map((s, i) => `
    <div class="input-nama-item" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectInputNama('${escJs(s.nama)}')"
      onmouseenter="hoverInputNamaItem(${i})"
      style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;">
      <div>
        <div style="font-weight:600;font-size:13.5px;">${highlight(s.nama, q)}${isNonAktif(s) ? ` <span style="font-size:12px;font-weight:700;color:var(--accent);background:var(--accent-pale);border-radius:5px;padding:1px 6px;vertical-align:middle;">${esc(kelasLabel(s))}</span>` : ''}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas)}${s.nisn ? ' · NISN ' + esc(s.nisn) : ''}</div>
      </div>
      ${tunggakBadge(s)}
    </div>`).join('');
  dd.style.display = 'block';
}

function hoverInputNamaItem(idx) {
  inputNamaSuggIdx = idx;
  document.querySelectorAll('.input-nama-item').forEach((el, i) => {
    el.style.background = i === idx ? 'var(--primary-pale)' : '';
  });
}

function onInputNamaKeydown(e) {
  const items = document.querySelectorAll('.input-nama-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    inputNamaSuggIdx = Math.min(inputNamaSuggIdx + 1, items.length - 1);
    items.forEach((el, i) => el.style.background = i === inputNamaSuggIdx ? 'var(--primary-pale)' : '');
    items[inputNamaSuggIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    inputNamaSuggIdx = Math.max(inputNamaSuggIdx - 1, 0);
    items.forEach((el, i) => el.style.background = i === inputNamaSuggIdx ? 'var(--primary-pale)' : '');
    items[inputNamaSuggIdx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && inputNamaSuggIdx >= 0) {
    const nama = items[inputNamaSuggIdx].dataset.nama;
    if (nama) selectInputNama(nama);
  } else if (e.key === 'Escape') {
    hideInputNamaDropdown();
  }
}

function selectInputNama(nama) {
  // Keranjang milik satu santri — ganti santri berarti keranjang dikosongkan.
  const lama = document.getElementById('inputNama').value;
  if (inputCart.length && lama !== nama) {
    if (!confirm(`Keranjang ${lama} masih berisi ${inputCart.length} item dan akan dikosongkan. Lanjut ganti santri?`)) {
      hideInputNamaDropdown();
      document.getElementById('inputNamaSearch').value = lama;
      return;
    }
    clearCart();
  }
  document.getElementById('inputNama').value = nama;
  document.getElementById('inputNamaSearch').value = nama;
  document.getElementById('inputNamaSearch').style.borderColor = 'var(--primary)';
  setTimeout(() => document.getElementById('inputNamaSearch').style.borderColor = '', 1500);
  hideInputNamaDropdown();
  onStudentSelect();
}

function hideInputNamaDropdown() {
  const dd = document.getElementById('inputNamaDropdown');
  if (dd) dd.style.display = 'none';
  inputNamaSuggIdx = -1;
}

// Toggle "Tampilkan santri non-aktif": fokuskan kolom pencarian lalu refresh
// dropdown, supaya daftar (termasuk santri lama) langsung muncul & tidak
// tertutup oleh blur/klik-di-luar saat mencentang.
function onToggleShowNonAktif() {
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) searchEl.focus();
  onInputNamaSearch();
}

// Sembunyikan dropdown saat kolom pencarian kehilangan fokus — kecuali fokus
// pindah ke elemen lain di dalam field nama (mis. checkbox non-aktif).
function onInputNamaBlur() {
  setTimeout(() => {
    const field = document.getElementById('inputNamaField');
    if (!field || !field.contains(document.activeElement)) hideInputNamaDropdown();
  }, 200);
}

// Tutup dropdown saat klik di luar area field nama (search + checkbox non-aktif)
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('inputNamaField') || document.getElementById('inputNamaSearch')?.closest('div');
  if (wrap && !wrap.contains(e.target)) hideInputNamaDropdown();
});

function onStudentSelect() {
  const nama = document.getElementById('inputNama').value;
  const s = getStudent(nama);
  if (!s) {
    document.getElementById('inputKelas').textContent = '—';
    document.getElementById('inputNISN').textContent = '—';
    document.getElementById('studentSummary').innerHTML = '';
    renderPaymentItems();
    return;
  }
  document.getElementById('inputKelas').textContent = kelasLabel(s);
  document.getElementById('inputNISN').textContent = s.nisn || '(belum diisi)';

  // Fakta ringkas santri saja. Rincian tunggakan sengaja TIDAK diulang di sini:
  // blok ini dulu menyalin persis isi panel "Total Seluruh Tunggakan" di kolom
  // kanan, sehingga angka yang sama terbaca dua kali dalam satu layar. Panel
  // kanan yang dipertahankan karena sekaligus punya tombol centang-semua.
  const bulanTerbayar = (s.spp_paid_months || []).length;
  // Santri yang masuk di tengah TA hanya ditagih sejak bulan masuknya.
  const bulanDitagih  = sppBillableMonths(s).length;
  document.getElementById('studentSummary').innerHTML = `
    <div style="margin-top:14px;padding:12px 14px;background:var(--primary-pale);border-radius:12px;display:grid;grid-template-columns:1fr auto;gap:7px 14px;align-items:baseline;">
      <div style="font-size:12px;color:var(--text-muted);">SPP per bulan</div>
      <div style="font-size:12.5px;font-weight:700;">${s.spp > 0 ? rp(s.spp) : '<span style="color:var(--text-muted);font-weight:400;">Belum diisi</span>'}</div>
      <div style="font-size:12px;color:var(--text-muted);">Bulan SPP terbayar</div>
      <div style="font-size:12.5px;font-weight:700;">${bulanTerbayar} <span style="font-weight:400;color:var(--text-muted);">dari ${bulanDitagih} bulan${sppMulaiLabel(s) ? ' (mulai ' + esc(sppMulaiLabel(s)) + ')' : ''}</span></div>
    </div>
  `;
  renderPaymentItems(s);

  // Ambil kondisi TERBARU santri ini dari server: bulan SPP / sisa tagihannya
  // bisa saja baru dilunasi lewat device lain. Tanpa ini, admin bisa menagih
  // (dan menerima) pembayaran yang sebenarnya sudah lunas.
  refreshSelectedStudent(s.nama);
}

// Apakah admin sudah mencentang sesuatu di form input?
// Bila ya, form JANGAN digambar ulang oleh sinkronisasi latar belakang.
function inputFormHasSelection() {
  return inputCart.length > 0;
}

let _refreshSelSeq = 0;
const _refreshSelAt = {};   // nama → timestamp terakhir diperiksa
async function refreshSelectedStudent(nama) {
  if (typeof refreshStudent !== 'function' || !nama) return;
  // Jangan menembak server berkali-kali untuk santri yang sama dalam sekejap
  // (onStudentSelect dipanggil ulang setiap kali data berubah).
  if (Date.now() - (_refreshSelAt[nama] || 0) < 5000) return;
  _refreshSelAt[nama] = Date.now();

  const seq = ++_refreshSelSeq;
  let changed = false;
  try { changed = await refreshStudent(nama); } catch { return; }
  if (!changed || seq !== _refreshSelSeq) return;
  if (document.getElementById('inputNama')?.value !== nama) return;

  if (inputFormHasSelection()) {
    // Ada centang yang sedang dikerjakan — jangan hapus isian admin, cukup beri
    // tahu bahwa datanya berubah di server.
    showSyncIndicator('🔄 Data santri ini berubah di device lain', 4000);
    return;
  }
  onStudentSelect();
}

// Dipanggil sinkronisasi latar belakang (js/sync.js) setelah data ditarik ulang.
// Hanya menggambar ulang bila form input sedang kosong, supaya centang yang
// sedang dikerjakan tidak hilang di tengah jalan.
function refreshInputPageIfIdle() {
  const el = document.getElementById('inputNama');
  const nama = el ? el.value : '';
  if (!nama || !getStudent(nama)) return;
  if (inputFormHasSelection()) return;
  onStudentSelect();
}

// Daftar item pembayaran yang berlaku untuk siswa terpilih. Dipakai bersama
// oleh renderPaymentItems, calcTotal, dan submitPayment agar selalu sinkron.
//   1. Item aktif yang cocok kelas siswa (atau semua item aktif bila belum
//      memilih siswa).
//   2. PLUS item tagihan siswa yang MASIH ada sisa, walaupun itemnya sudah
//      dinonaktifkan / dihapus atau kelasnya tak lagi cocok — supaya tunggakan
//      lama tetap bisa dilunasi (penting untuk santri non-aktif: lulus/pindah/keluar).
//   Pengecualian: santri LULUS tidak menampilkan SPP tahun berjalan (bulanan),
//      karena kewajibannya sudah pindah ke "tunggakan tahun lalu" (spp_history).
function getInputItems(student) {
  const list = [];
  const seen = new Set();
  appState.payItems.forEach(i => {
    if (!i.active) return;
    if (!i.kelas || !i.kelas.length) return;
    if (student && !(i.kelas || []).includes(String(student.kelas))) return;
    if (i.type === 'bulanan' && student && student.status_kelulusan === 'lulus') return;
    list.push(i);
    seen.add(i.id);
  });
  if (student) {
    appState.tagihan
      .filter(t => t.nama === student.nama && Math.max(0, (t.nominal || 0) - (t.paid_amount || 0)) > 0)
      .forEach(t => {
        if (seen.has(t.item_id)) return;
        const def = appState.payItems.find(i => i.id === t.item_id);
        list.push({
          id: t.item_id,
          name: (def && def.name) || t.item_name || t.item_id,
          amount: t.nominal || 0,
          type: 'tetap',
          active: true,
          kelas: [],
          _fromTagihan: true, // penanda: berasal dari tagihan lama (item nonaktif/terhapus)
        });
        seen.add(t.item_id);
      });
  }
  return list;
}

// ══════════════════════════════════════════
// KARTU TAGIHAN — gaya kasir (POS)
// ══════════════════════════════════════════
// Klik chip bulan / tombol "Lunas" langsung memasukkan baris ke keranjang (klik
// lagi = keluarkan). Bayar sebagian = ubah nominal baris itu di keranjang.
// Keranjang lalu disimpan sekaligus jadi SATU kuitansi (lihat submitPayment).

// Nominal SPP per bulan yang dipakai form (SPP santri, atau nominal baku item).
function sppInputRate(student) {
  if (!student) return 0;
  const it = getInputItems(student).find(i => i.type === 'bulanan');
  return Number(student.spp) || Number(it && it.amount) || 0;
}

// Sisa bulan `m` tahun berjalan yang masih harus dibayar (memperhitungkan angsuran).
function sppInputSisa(student, m) {
  if (!student || (student.spp_paid_months || []).includes(m)) return 0;
  const a = (student.spp_angsur && Number(student.spp_angsur[m])) || 0;
  return Math.max(0, sppInputRate(student) - a);
}

function inputStudent() {
  return getStudent(document.getElementById('inputNama').value);
}

function renderPaymentItems(student) {
  const cont = document.getElementById('paymentItems');
  inputPrevArrears = student ? sppTunggakanPrevList(student) : [];
  if (!student) {
    cont.innerHTML = `<div class="pos-empty">👆 Pilih santri dulu — tagihannya akan muncul di sini.</div>`;
    syncChips(); calcTotal();
    return;
  }
  const activeItems = getInputItems(student);
  if (!activeItems.length && !inputPrevArrears.length) {
    cont.innerHTML = '<div class="pos-empty">Tidak ada item aktif. Aktifkan di menu "Kelola Item Bayar"</div>';
    return;
  }
  const chip = (key, onclick, label, sub, cls) =>
    `<button type="button" class="pos-chip ${cls}" data-key="${esc(key)}" onclick="${onclick}" aria-pressed="false">
      <span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;

  const cards = activeItems.map(item => {
    const tagih = findTagihan(student.nama, item.id);
    const head = (right) => `<div class="pos-card-head">
        <div class="pos-card-name">${esc(item.name)}${item._fromTagihan ? ' <span class="pos-tag danger">tunggakan lama</span>' : ''}</div>
        <div class="pos-card-meta">${right}</div></div>`;

    if (item.type === 'bulanan') {
      const rate = sppInputRate(student);
      const tunggak = sppUnpaidDueMonths(student);
      const dimuka  = sppUpcomingMonths(student);
      if (!tunggak.length && !dimuka.length) return doneRow(item.name, 'lunas', 'Semua bulan sudah lunas');
      if (rate <= 0) return doneRow(item.name, 'warn', 'Nominal SPP santri belum diatur');
      const mulaiSpp = sppMulaiLabel(student);
      const mchip = (m, due) => {
        const dibayar = sppBulanDibayar(student, m);
        return chip('cur||' + m, `toggleCartLine('cur','${m}',this)`, esc(MONTH_FULL[m]),
          dibayar > 0 ? 'sisa ' + rp(sppInputSisa(student, m)) : '', (due ? 'due' : 'ahead') + (dibayar > 0 ? ' partial' : ''));
      };
      return `<div class="pos-card">${head(rp(rate) + '/bln')}
        ${mulaiSpp ? `<div class="pos-note">📅 Santri masuk di tengah tahun ajaran — SPP dihitung mulai <strong>${esc(mulaiSpp)}</strong>.</div>` : ''}
        ${tunggak.length
          ? `<div class="pos-label danger">Menunggak · ${tunggak.length} bulan</div><div class="pos-chips">${tunggak.map(m => mchip(m, true)).join('')}</div>`
          : `<div class="pos-note ok">✅ Tidak ada tunggakan SPP s/d bulan berjalan</div>`}
        ${dimuka.length ? `<details class="pos-more"><summary>Bayar di muka · ${dimuka.length} bulan</summary>
          <div class="pos-chips">${dimuka.map(m => mchip(m, false)).join('')}</div></details>` : ''}
      </div>`;
    }

    if (item.type === 'tetap') {
      const sisa = tagih ? Math.max(0, tagih.nominal - tagih.paid_amount) : (item.amount || 0);
      // "Nominal belum diatur" & "lunas" tak boleh bergantung pada adanya tagihan
      // (item aktif tanpa tagihan bernominal 0 dulu tampil sebagai "Rp 0").
      if (tagih ? tagih.nominal <= 0 : (item.amount || 0) <= 0) return doneRow(item.name, 'warn', 'Nominal belum diatur — atur di "Kelola Item Bayar"');
      if (sisa <= 0) return doneRow(item.name, 'lunas', 'Lunas ' + rp(tagih.nominal));
      const id = escJs(item.id);
      return `<div class="pos-card">${head(tagih
          ? `sisa <strong class="danger">${rp(sisa)}</strong> dari ${rp(tagih.nominal)}`
          : `${rp(sisa)} <span class="muted">(belum ditagihkan)</span>`)}
        ${tagih && tagih.paid_amount > 0 ? `<div class="pos-progress"><i style="width:${Math.min(100, tagih.paid_amount / tagih.nominal * 100)}%"></i></div>` : ''}
        <div class="pos-actions">
          ${chip('tetap||' + item.id, `toggleCartLine('tetap','${id}',this)`, 'Lunas ' + rp(sisa), '', 'due wide')}
          <button type="button" class="pos-ghost-btn" onclick="angsurLine('tetap','${id}',this)">✎ Bayar sebagian</button>
        </div></div>`;
    }

    // custom: nominal diketik bebas.
    if (tagih && tagih.nominal > 0 && (tagih.nominal - tagih.paid_amount) <= 0) return doneRow(item.name, 'lunas', 'Lunas ' + rp(tagih.nominal));
    return `<div class="pos-card">${head('nominal bebas')}
      <div class="pos-actions">
        <input type="number" id="custom_${esc(item.id)}" class="pos-input" placeholder="Nominal..." min="1" aria-label="Nominal ${esc(item.name)}"
          onkeydown="if(event.key==='Enter')addCustomLine('${escJs(item.id)}',this)">
        <button type="button" class="pos-chip due" data-key="${esc('custom||' + item.id)}" onclick="addCustomLine('${escJs(item.id)}',this)"><span>+ Tambah</span></button>
      </div></div>`;
  }).join('');

  cont.innerHTML = renderArrearsBanner(student, inputPrevArrears) + cards
    + (inputPrevArrears.length ? renderPrevArrearsBlock(inputPrevArrears, chip) : '');
  syncChips();
  calcTotal();
}

// Item yang tak perlu tindakan (lunas / nominal belum diatur): satu baris tipis.
function doneRow(name, kind, text) {
  return `<div class="pay-item-done ${kind === 'warn' ? 'is-warn' : 'is-lunas'}">
    <span class="pid-mark">${kind === 'warn' ? '⚠️' : '✓'}</span>
    <span class="pid-name">${esc(name)}</span>
    <span class="pid-note">${esc(text)}</span>
  </div>`;
}

// Ringkasan seluruh tunggakan santri + tombol "masukkan semua".
function renderArrearsBanner(student, prevList) {
  const sppNow = sppTunggakan(student);
  const bulanNow = (student.spp || 0) > 0 ? sppUnpaidDueMonths(student).length : 0;
  const baris = [];
  if (sppNow > 0) baris.push({ label: `SPP tahun berjalan (${bulanNow} bln)`, amount: sppNow });
  prevList.forEach(y => baris.push({ label: `SPP TA ${y.ta} (${y.unpaid.length} bln)`, amount: y.amount }));
  appState.tagihan
    .filter(t => t.nama === student.nama && Math.max(0, (t.nominal || 0) - (t.paid_amount || 0)) > 0)
    .forEach(t => baris.push({ label: t.item_name, amount: Math.max(0, t.nominal - t.paid_amount) }));
  const total = baris.reduce((a, r) => a + r.amount, 0);
  if (total <= 0) return `<div class="pos-banner ok">✅ Tidak ada tunggakan — seluruh kewajiban ${esc(student.nama)} sudah lunas</div>`;
  return `<div class="pos-banner">
    <div class="pos-banner-top">
      <div><div class="pos-banner-label">Total tunggakan</div><div class="pos-banner-total">${rp(total)}</div></div>
      <button type="button" class="btn btn-danger btn-sm" onclick="selectAllTunggakan(this)"><svg class="ic"><use href="#i-zap"/></svg> Masukkan semua</button>
    </div>
    <div class="pos-banner-rows">${baris.map(r => `<span>${esc(r.label)}</span><b>${rp(r.amount)}</b>`).join('')}</div>
  </div>`;
}

// Tunggakan SPP tahun ajaran sebelumnya: chip per bulan per TA.
function renderPrevArrearsBlock(list, chip) {
  return `<div class="pos-card prev">
    <div class="pos-card-head"><div class="pos-card-name danger">⚠️ Tunggakan SPP TA sebelumnya</div>
      <div class="pos-card-meta">${rp(list.reduce((a, y) => a + y.amount, 0))}</div></div>
    ${list.map(y => `<div class="pos-label">TA ${esc(y.ta)}${y.kelas ? ' · Kelas ' + esc(y.kelas) : ''}</div>
      <div class="pos-chips">${y.detail.map(d => chip('prev|' + y.ta + '|' + d.m,
        `toggleCartLine('prev','${escJs(y.ta)}|${d.m}',this)`, esc(MONTH_FULL[d.m]), rp(d.sisa),
        'due' + (d.dibayar > 0 ? ' partial' : ''))).join('')}</div>`).join('')}
  </div>`;
}

// ══════════════════════════════════════════
// KERANJANG
// ══════════════════════════════════════════
// Tiap baris = satu bulan / satu item:
//   { kind:'cur'|'prev'|'tetap'|'custom', id, base, m, ta, rate,
//     amount, max (sisa yang boleh dibayar), paidBefore (sudah diangsur) }
let inputCart = [];
let _cartBaru = '';   // key baris terakhir yang masuk (untuk animasi)

const cartKey = l => l.kind + '|' + (l.ta || '') + '|' + (l.m || l.id);

// Nama baris untuk kuitansi: penanda (Angsur)/(Pelunasan Angsur) mengikuti nominal.
function cartLineName(l) {
  if (l.kind === 'custom') return l.base;
  const base = l.kind === 'prev' ? `SPP Tunggakan TA ${l.ta}` : l.base;
  if (l.amount < l.max) return base + ' (Angsur)';
  return base + (l.paidBefore > 0 ? ' (Pelunasan Angsur)' : '');
}

// Baris keranjang (nominal awal = sisa penuh) untuk satu pilihan. null bila tak ada sisa.
function lineFor(student, kind, ref) {
  if (kind === 'cur') {
    const it = getInputItems(student).find(i => i.type === 'bulanan');
    const sisa = sppInputSisa(student, ref);
    return sisa > 0 ? { kind, id: it ? it.id : 'spp', base: it ? it.name : 'SPP Bulanan', m: ref,
      amount: sisa, max: sisa, paidBefore: sppBulanDibayar(student, ref) } : null;
  }
  if (kind === 'prev') {
    const [ta, m] = ref.split('|');
    const y = inputPrevArrears.find(p => p.ta === ta);
    const d = y && y.detail.find(x => x.m === m);
    return d && d.sisa > 0 ? { kind, id: 'spp', ta, rate: y.rate, m, amount: d.sisa, max: d.sisa, paidBefore: d.dibayar } : null;
  }
  if (kind === 'tetap') {
    const item = getInputItems(student).find(i => i.id === ref);
    const t = findTagihan(student.nama, ref);
    const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : ((item && item.amount) || 0);
    return item && sisa > 0 ? { kind, id: ref, base: item.name, amount: sisa, max: sisa } : null;
  }
  return null;
}

// Klik chip: masuk keranjang, atau keluar bila sudah ada.
function toggleCartLine(kind, ref, el) {
  const student = inputStudent();
  if (!student) return;
  const l = lineFor(student, kind, ref);
  if (!l) return;
  const i = inputCart.findIndex(x => cartKey(x) === cartKey(l));
  if (i >= 0) inputCart.splice(i, 1);
  else { inputCart.push(l); _cartBaru = cartKey(l); flyToCart(el); }
  afterCartChange();
}

// "Bayar sebagian": pastikan baris ada di keranjang, lalu fokus ke nominalnya.
function angsurLine(kind, ref, el) {
  const student = inputStudent();
  const l = student && lineFor(student, kind, ref);
  if (!l) return;
  if (!inputCart.some(x => cartKey(x) === cartKey(l))) { inputCart.push(l); _cartBaru = cartKey(l); flyToCart(el); }
  afterCartChange();
  const inp = document.querySelector(`#inputCart [data-key="${CSS.escape(cartKey(l))}"] input`);
  if (inp) { inp.focus(); inp.select(); }
}

function addCustomLine(id, el) {
  const student = inputStudent();
  const inp = document.getElementById('custom_' + id);
  const amt = Math.round(Number(inp && inp.value) || 0);
  const item = student && getInputItems(student).find(i => i.id === id);
  if (!item) return;
  if (amt <= 0) { toast('⚠️ Isi nominalnya dulu'); if (inp) inp.focus(); return; }
  const l = { kind: 'custom', id, base: item.name, amount: amt, max: Infinity };
  const ada = inputCart.find(x => cartKey(x) === cartKey(l));
  if (ada) ada.amount = amt; else inputCart.push(l);
  _cartBaru = cartKey(l);
  flyToCart(el);
  if (inp) inp.value = '';
  afterCartChange();
}

// Masukkan seluruh tunggakan (bulan jatuh tempo, TA lalu, sisa tagihan) sekaligus.
function selectAllTunggakan(el) {
  const student = inputStudent();
  if (!student) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const ada = new Set(inputCart.map(cartKey));
  const baru = [
    ...sppUnpaidDueMonths(student).map(m => lineFor(student, 'cur', m)),
    ...inputPrevArrears.flatMap(y => y.detail.map(d => lineFor(student, 'prev', y.ta + '|' + d.m))),
    ...getInputItems(student).filter(i => i.type === 'tetap').map(i => lineFor(student, 'tetap', i.id)),
  ].filter(l => l && !ada.has(cartKey(l)));
  if (!baru.length) { toast('Semua tunggakan sudah ada di keranjang'); return; }
  inputCart.push(...baru);
  _cartBaru = cartKey(baru[baru.length - 1]);
  flyToCart(el);
  afterCartChange();
  toast(`🛒 ${baru.length} tunggakan masuk keranjang — periksa sebelum membayar`);
}

function removeCartLine(i) {
  const row = document.querySelectorAll('#inputCart .cart-row')[i];
  const hapus = () => { inputCart.splice(i, 1); afterCartChange(); };
  if (row && row.animate && !_reduceMotion()) row.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px)' }],
    { duration: 180, easing: 'ease-in' }).onfinish = hapus;
  else hapus();
}

function editCartLine(i, el) {
  const l = inputCart[i];
  if (!l) return;
  const v = Math.round(Number(el.value) || 0);
  if (v <= 0) { toast('⚠️ Nominal harus lebih dari 0 — pakai ✕ untuk menghapus baris.'); renderCart(); return; }
  l.amount = Math.min(l.max, v);
  if (v > l.max) toast(`⚠️ Maksimal ${rp(l.max)} (sisa tagihan)`);
  renderCart();
  calcTotal();
}

function clearCart() {
  inputCart = [];
  renderCart();
  syncChips();
}

function afterCartChange() {
  renderCart();
  syncChips();
  calcTotal();
}

// Tandai chip yang barisnya sedang ada di keranjang.
function syncChips() {
  const ada = new Set(inputCart.map(cartKey));
  document.querySelectorAll('#paymentItems [data-key]').forEach(el => {
    const on = ada.has(el.dataset.key);
    el.classList.toggle('in-cart', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function renderCart() {
  const box = document.getElementById('inputCart');
  const count = document.getElementById('cartCount');
  if (count) {
    count.textContent = inputCart.length;
    count.classList.toggle('show', inputCart.length > 0);
  }
  if (!box) return;
  if (!inputCart.length) {
    box.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🛒</div>Keranjang kosong<br><small>Klik bulan atau tombol <b>Lunas</b> di daftar tagihan</small></div>`;
    _cartBaru = '';
    return;
  }
  box.innerHTML = inputCart.map((l, i) => {
    const sebagian = l.max !== Infinity && l.amount < l.max;
    return `<div class="cart-row${cartKey(l) === _cartBaru ? ' is-new' : ''}" data-key="${esc(cartKey(l))}">
      <div class="cart-row-info">
        <div class="cart-row-name">${esc(l.kind === 'prev' ? 'SPP TA ' + l.ta : l.base)}${l.m ? ' · <b>' + esc(MONTH_FULL[l.m]) + '</b>' : ''}</div>
        ${sebagian ? `<div class="cart-row-sub"><span class="pos-tag">Angsur</span> sisa ${rp(l.max - l.amount)} tetap menunggak</div>`
          : l.paidBefore > 0 ? `<div class="cart-row-sub"><span class="pos-tag ok">Pelunasan</span></div>` : ''}
      </div>
      <label class="cart-amount" title="Ubah nominal untuk bayar sebagian">✎
        <input type="number" value="${l.amount}" min="1" ${l.max !== Infinity ? `max="${l.max}"` : ''}
          onchange="editCartLine(${i}, this)" onkeydown="if(event.key==='Enter')this.blur()" aria-label="Nominal ${esc(cartLineName(l))}">
      </label>
      <button type="button" class="cart-del" onclick="removeCartLine(${i})" aria-label="Hapus ${esc(cartLineName(l))}">✕</button>
    </div>`;
  }).join('');
  _cartBaru = '';
}

function calcTotal() {
  const total = inputCart.reduce((a, l) => a + l.amount, 0);
  const el = document.getElementById('inputTotal');
  if (el && el.textContent !== rp(total)) {
    el.textContent = rp(total);
    if (el.animate && !_reduceMotion()) el.animate(
      [{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }
  const bar = document.getElementById('cartMiniBar');
  if (bar) {
    bar.classList.toggle('show', inputCart.length > 0);
    bar.querySelector('span').textContent = `${inputCart.length} item · ${rp(total)}`;
  }
}

function _reduceMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Animasi "terbang ke keranjang": salinan chip melengkung ke panel keranjang
// (atau ke bar mini di HP bila panelnya di luar layar).
function flyToCart(el) {
  if (!el || !el.animate || _reduceMotion()) return;
  const cart = document.getElementById('cartPanel');
  const bar = document.getElementById('cartMiniBar');
  let target = cart && cart.getBoundingClientRect();
  if (!target || target.top > window.innerHeight || target.bottom < 0) target = bar && bar.getBoundingClientRect();
  if (!target) return;
  const a = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('pos-fly');
  Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
  document.body.appendChild(ghost);
  const dx = target.left + Math.min(target.width / 2, 120) - (a.left + a.width / 2);
  const dy = target.top + 40 - (a.top + a.height / 2);
  ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) scale(.85)`, opacity: .95, offset: .55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0 },
  ], { duration: 600, easing: 'cubic-bezier(.45,0,.25,1)' }).onfinish = () => {
    ghost.remove();
    const badge = document.getElementById('cartCount');
    if (badge && badge.animate) badge.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  };
}

// Gabungkan baris keranjang jadi item pembayaran (format lama submitPayment):
// bulan-bulan dengan nama sama dijadikan satu item ber-bulanList.
function linesToItems(lines) {
  const items = [], byKey = {};
  lines.forEach(l => {
    const name = cartLineName(l);
    if (l.kind === 'tetap' || l.kind === 'custom') {
      items.push({ id: l.id, type: l.kind, name, amount: l.amount, bulan: null });
      return;
    }
    const k = l.kind + '|' + (l.ta || '') + '|' + name;
    let it = byKey[k];
    if (!it) {
      it = byKey[k] = { id: l.id, type: l.kind === 'prev' ? 'spp_prev' : 'bulanan', name, amount: 0,
        bulanList: [], bulanAmounts: {}, angsurMonths: [], ...(l.kind === 'prev' ? { ta: l.ta, rate: l.rate } : {}) };
      items.push(it);
    }
    it.amount += l.amount;
    it.bulanList.push(l.m);
    it.bulanAmounts[l.m] = l.amount;
    if (l.amount < l.max || l.paidBefore > 0) it.angsurMonths.push(l.m);
  });
  return items;
}

// Sisa TERBARU yang boleh dibayar untuk satu baris (dibaca dari appState
// setelah refreshStudent), untuk menolak baris yang sudah dibayar perangkat lain.
function cartLineFreshMax(l, student) {
  if (l.kind === 'cur')  return sppInputSisa(student, l.m);
  if (l.kind === 'prev') return sppTunggakanPrevList(student).find(y => y.ta === l.ta)?.detail.find(d => d.m === l.m)?.sisa || 0;
  if (l.kind === 'tetap') {
    const t = findTagihan(student.nama, l.id);
    return t ? Math.max(0, t.nominal - t.paid_amount) : l.max;
  }
  return l.max;
}

// Cegah klik "Simpan" dua kali tercatat sebagai dua pembayaran.
let _menyimpanBayar = false;
async function submitPayment() {
  if (_menyimpanBayar) { toast('⏳ Pembayaran sedang disimpan...'); return; }
  _menyimpanBayar = true;
  try { await _submitPayment(); }
  finally { _menyimpanBayar = false; }
}

async function _submitPayment() {
  const nama = document.getElementById('inputNama').value;
  if (!nama) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const lines = [...inputCart];
  if (!lines.length) { toast('⚠️ Keranjang masih kosong — klik tagihan yang mau dibayar.'); return; }

  // Keranjang bisa berumur beberapa menit: pastikan tak ada yang sudah dibayar
  // dari perangkat lain sementara itu.
  try { await refreshStudent(nama); } catch { /* offline: penyimpanan di bawah yang gagal */ }
  const student = getStudent(nama);
  const basi = lines.filter(l => l.amount > cartLineFreshMax(l, student));
  if (basi.length) {
    inputCart = inputCart
      .map(l => { const mx = cartLineFreshMax(l, student); return { ...l, max: mx, amount: Math.min(l.amount, mx) }; })
      .filter(l => l.max > 0);
    renderCart();
    renderPaymentItems(student);
    toast('⚠️ ' + basi.map(l => cartLineName(l) + (l.m ? ' ' + MONTH_FULL[l.m] : '')).join(', ')
      + ' sudah dibayar/berubah dari perangkat lain — keranjang disesuaikan, periksa lalu simpan lagi.', 9000);
    return;
  }
  // Angsuran SPP tahun berjalan butuh kolom spp_angsur & nominal SPP santri.
  if (lines.some(l => l.kind === 'cur' && l.amount < l.max)) {
    if (!(Number(student.spp) > 0)) { toast('⚠️ Nominal SPP santri belum diatur — angsuran tidak bisa dihitung sisanya.'); return; }
    if (!sppAngsurKolomAda()) { toast('⚠️ ' + SPP_ANGSUR_MIGRASI_MSG, 9000); return; }
  }
  const items = linesToItems(lines);

  // Kumpulkan perubahan sebagai SELISIH (bulan baru & nominal tambahan), lalu
  // digabungkan ke kondisi terbaru di server. Jangan menghitung nilai akhir
  // dari salinan lokal: bila device lain sudah menginput lebih dulu, salinan
  // lokal sudah usang dan pembayaran mereka akan tertimpa.
  //   • bulan lunas biasa  → tandai lunas
  //   • angsuran/pelunasan → tambah nominal; lunas otomatis bila mencapai SPP
  //   • tunggakan TA lalu  → tambah nominal pada bulan TA tersebut
  const sppOps = { cur: [], hist: [] };
  const tagihanUpdates = [];             // { id, delta }
  items.forEach(it => {
    if (it.type === 'spp_prev') {
      (it.bulanList || []).forEach(b => sppOps.hist.push({ ta: it.ta, m: b, delta: it.bulanAmounts[b], rate: it.rate }));
    } else if (it.bulanList?.length) {
      it.bulanList.forEach(b => {
        if ((it.angsurMonths || []).includes(b)) sppOps.cur.push({ m: b, delta: it.bulanAmounts[b] });
        else sppOps.cur.push({ m: b, add: true });
      });
    }
    if (it.type === 'tetap') {
      const t = findTagihan(nama, it.id);
      if (t) tagihanUpdates.push({ id: t.id, delta: it.amount });
    }
  });

  // Tanggal/jam & metode pembayaran dari form (bisa hari ini atau tanggal lain)
  const timeStr = buildInputTimeStr();
  const meta = getPaymentMeta();
  const totalAmt = items.reduce((a,i)=>a+i.amount,0);
  const txn = {
    nama, kelas: student.kelas,
    jenis: items.map(i => i.bulanList?.length ? i.name+' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')' : i.name).join(', '),
    nominal: totalAmt, time: timeStr, catatan: document.getElementById('inputCatatan').value,
    metode: meta.metode, dibayar_oleh: meta.dibayar_oleh,
  };

  // Simpan ke tabel kuitansi Supabase (await agar ID tersedia saat cetak)
  const noKwt = await generateNoKuitansi();
  const kwtData = {
    no_kuitansi: noKwt,
    nama, kelas: student.kelas, nisn: student.nisn||'',

    // Rincian per bulan: pakai nominal asli tiap bulan bila ada (tunggakan lama
    // bisa beda nominal per bulan / sisa angsuran), selain itu bagi rata.
    items: items.flatMap(i => {
      // `angsur` & `ta` dipakai saat kuitansi dihapus/dikoreksi supaya efeknya
      // dibalik sebesar nominalnya, di tempat yang benar (lihat sppRevertOp).
      if (i.bulanList?.length) return i.bulanList.map(b => ({
        item_id: i.id, name: i.name,
        amount: (i.bulanAmounts && i.bulanAmounts[b] != null) ? i.bulanAmounts[b] : i.amount / i.bulanList.length,
        bulan: b,
        ...((i.angsurMonths || []).includes(b) ? { angsur: true } : {}),
        ...(i.type === 'spp_prev' ? { ta: i.ta, rate: i.rate } : {}),
      }));
      return [{ item_id: i.id, name: i.name, amount: i.amount, bulan: i.bulan || null }];
    }),
    total: totalAmt, catatan: txn.catatan, dicetak: false,
    ta_label: getProfil().ta || '',
    metode: meta.metode, dibayar_oleh: meta.dibayar_oleh, tgl_bayar: timeStr,
  };
  // Kuitansi (buku besar) disimpan LEBIH DULU: bila gagal, belum ada data yang
  // berubah dan admin cukup mengulang. Bila data santri yang gagal sesudahnya,
  // kuitansinya sudah ada sehingga menu Periksa & Pulihkan bisa memulihkannya.
  try {
    const res = await insertKuitansi(kwtData);
    pendingKwtId = res?.[0]?.id || null;
  } catch (e) {
    console.error('insertKuitansi:', e);
    toast('⚠️ Gagal menyimpan kuitansi — belum ada yang tercatat, silakan coba lagi. (' + e.message + ')', 9000);
    return;
  }
  pendingKwtData = { ...kwtData, time: timeStr };

  appState.transactions.push(txn);
  // Tulis-gabung ke server (baca kondisi terbaru → tambahkan perubahan ini).
  try {
    await commitSppOps(nama, sppOps);
    await Promise.all(tagihanUpdates.map(u => addTagihanPaid(u.id, u.delta)));
  } catch (e) {
    console.error('submitPayment data:', e);
    toast(`⚠️ Kuitansi ${kwtData.no_kuitansi} tersimpan, tapi data tunggakan santri gagal diperbarui (${e.message}). `
      + 'JANGAN input ulang — jalankan menu Periksa & Pulihkan.', 12000);
  }
  saveTransaction(txn);

  // Render session table
  const tbody = document.querySelector('#sessionTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${esc(nama)}</strong></td><td>${esc(student.kelas)}</td><td>${esc(items.map(i=>i.name+(i.bulanList?.length?' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')':i.bulan?' ('+MONTH_FULL[i.bulan]+')':'')).join(', '))}</td><td><strong>${rp(totalAmt)}</strong></td><td>${esc(timeStr)}</td><td style="white-space:nowrap;"><button class="btn btn-primary btn-sm" onclick="cetakKuitansiById('${escJs(nama)}','${escJs(timeStr)}')"><svg class="ic"><use href="#i-print"/></svg> Kuitansi</button> <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">✕</button></td>`;
  if(tbody.firstChild?.tagName==='TR' && tbody.firstChild.querySelector('[colspan]')) tbody.innerHTML='';
  tbody.prepend(row);

  // Reset form
  document.getElementById('inputNama').value='';
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) { searchEl.value=''; searchEl.style.borderColor=''; }
  document.getElementById('inputKelas').textContent='—';
  document.getElementById('inputNISN').textContent='—';
  document.getElementById('studentSummary').innerHTML='';
  document.getElementById('inputCatatan').value='';
  resetPaymentMeta();
  clearCart();
  renderPaymentItems();

  // Tampilkan popup konfirmasi cetak
  document.getElementById('modalCetakNama').textContent = nama + ' — ' + student.kelas;
  document.getElementById('modalCetakTotal').textContent = rp(totalAmt);
  document.getElementById('modalCetakKwt').style.display = 'flex';
}

async function cetakKuitansi(data) {
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }

  // Pastikan template terbaru dari Supabase
  await loadTemplateKuitansi();

  // Gunakan no_kuitansi dari data (sudah di-generate saat simpan)
  // Jika belum ada (cetak langsung), generate baru
  if (!data.no_kuitansi) {
    data.no_kuitansi = await generateNoKuitansi();
  }

  const lembar1 = buildKuitansiHTML(data, ktData, 'Lembar Pembayar');
  const lembar2 = buildKuitansiHTML(data, ktData, 'Lembar Arsip');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Kuitansi — ${esc(data.nama)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    /* Pastikan warna pembeda lembar pembayar & arsip ikut tercetak */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { body { margin:0; background:#fff; } .no-print { display:none !important; } }
    body { font-family:'Times New Roman',serif; background:#f5f5f5; margin:0; padding:16px; }
    .kuitansi-wrap { display:flex; flex-direction:column; gap:10px; max-width:190mm; margin:0 auto; }
    hr.sep { border:none; border-top:2px dashed #aaa; margin:4px 0; }
    .print-btn { display:block; margin:0 auto 14px; padding:10px 32px; background:#1e5631; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; }
  </style></head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Cetak Kuitansi</button>
  <div class="kuitansi-wrap">
    ${lembar1}
    <hr class="sep">
    ${lembar2}
  </div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=750');
  w.document.write(html);
  w.document.close();
}

// ── DATA SISWA ──
