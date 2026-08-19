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
      ? `<span style="font-size:11px;font-weight:700;color:var(--danger);background:var(--danger-pale);padding:2px 8px;border-radius:20px;">⚠️ ${rp(tk)}</span>`
      : `<span style="font-size:11px;font-weight:700;color:var(--primary-light);background:var(--primary-pale);padding:2px 8px;border-radius:20px;">✓ Lunas</span>`;
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
        <div style="font-weight:600;font-size:13.5px;">${highlight(s.nama, q)}${isNonAktif(s) ? ` <span style="font-size:10px;font-weight:700;color:var(--accent);background:var(--accent-pale);border-radius:5px;padding:1px 6px;vertical-align:middle;">${esc(kelasLabel(s))}</span>` : ''}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${esc(s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas)}${s.nisn ? ' · NISN ' + esc(s.nisn) : ''}</div>
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
  const cont = document.getElementById('paymentItems');
  if (cont && cont.querySelector('input[type="checkbox"]:checked')) return true;
  return getSppMonthsSelected().length > 0 || getSppPrevSelected().length > 0;
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

function renderPaymentItems(student) {
  const cont = document.getElementById('paymentItems');
  const activeItems = getInputItems(student);
  if (!activeItems.length) {
    cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Tidak ada item aktif. Aktifkan di menu "Kelola Item Bayar"</div>';
    return;
  }

  let html = activeItems.map(item => {
    let amount = item.amount;
    let extra = '';
    // Item yang tak perlu tindakan (sudah lunas / nominal belum diatur) tidak
    // lagi digambar sebagai kartu penuh yang diredupkan — cukup satu baris
    // tipis, supaya perhatian tertuju pada item yang masih harus dibayar.
    let doneNote = null;
    // Tagihan santri untuk item ini, dipakai bersama oleh semua cabang di bawah
    // (termasuk cabang 'custom', yang dulu tidak memeriksanya sama sekali).
    const tagih = student ? findTagihan(student.nama, item.id) : null;

    if (item.type === 'bulanan' && student) {
      amount = student.spp || item.amount || 0;
      // Bulan menunggak = yang sudah jatuh tempo (Juli s/d bulan berjalan) &
      // belum dibayar. Bulan yang belum tiba tetap ditampilkan terpisah agar
      // wali yang ingin membayar di muka tetap bisa memilihnya.
      const tunggak  = sppUnpaidDueMonths(student);
      const dimuka   = sppUpcomingMonths(student);
      // Santri yang masuk di tengah TA (mis. promosi SPMB bulan November):
      // bulan sebelum ia masuk tidak ditagih sama sekali, jadi tidak muncul
      // sebagai tunggakan maupun sebagai pilihan bayar di muka.
      const mulaiSpp = sppMulaiLabel(student);
      const chip = (m, jatuhTempo) => `
        <label style="display:flex;align-items:center;gap:4px;padding:4px 9px;border:1.5px solid ${jatuhTempo?'var(--danger)':'var(--border)'};border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;transition:.15s;${jatuhTempo?'color:var(--danger);':'color:var(--text-muted);'}"
          id="sppMonthLabel_${m}" onclick="toggleSppMonth('${m}',this)">
          <input type="checkbox" id="sppChk_${m}" value="${m}" style="display:none;">
          ${MONTH_FULL[m]}
        </label>`;
      if (tunggak.length === 0 && dimuka.length === 0) {
        doneNote = { kind: 'lunas', text: 'Semua bulan sudah lunas' };
      } else if (amount > 0) {
        extra = `<div style="margin-top:8px;">
          ${mulaiSpp ? `
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">📅 Santri masuk di tengah tahun ajaran — SPP dihitung mulai <strong>${esc(mulaiSpp)}</strong>.</div>` : ''}
          ${tunggak.length ? `
          <div style="font-size:11px;font-weight:600;color:var(--danger);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Tunggakan — ${tunggak.length} bulan (s/d bulan berjalan):</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${tunggak.map(m => chip(m, true)).join('')}
          </div>` : `
          <div style="font-size:12px;color:var(--primary-light);font-weight:600;margin-bottom:6px;">✅ Tidak ada tunggakan SPP s/d bulan berjalan</div>`}
          ${dimuka.length ? `
          <details style="margin-top:10px;">
            <summary style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;cursor:pointer;">Bayar di muka (${dimuka.length} bulan belum jatuh tempo)</summary>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">
              ${dimuka.map(m => chip(m, false)).join('')}
            </div>
          </details>` : ''}
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted);" id="sppMonthInfo">Belum ada bulan dipilih</div>
        </div>`;
      }
    } else if (item.type === 'tetap' && student) {
      const t = tagih;
      const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : (item.amount || 0);
      amount = sisa;
      // Syarat "nominal belum diatur" & "lunas" TIDAK boleh bergantung pada
      // adanya baris tagihan. Dulu keduanya diawali `t &&`, sehingga item aktif
      // yang belum punya tagihan dan nominalnya Rp 0 lolos ke bawah tanpa
      // cabang mana pun — tergambar sebagai kartu bercentang "Rp 0 (sisa)".
      if (t ? t.nominal <= 0 : (item.amount || 0) <= 0) {
        doneNote = { kind: 'warn', text: 'Nominal belum diatur — atur di "Kelola Item Bayar"' };
      } else if (sisa <= 0) {
        doneNote = { kind: 'lunas', text: 'Lunas ' + rp(t.nominal) };
      } else if (t) {
        extra = `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
            Total: <strong>${rp(t.nominal)}</strong> &nbsp;|&nbsp;
            Dibayar: <strong style="color:var(--primary-light);">${rp(t.paid_amount)}</strong> &nbsp;|&nbsp;
            <strong style="color:var(--danger);">Sisa: ${rp(sisa)}</strong>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <select id="tetapMode_${esc(item.id)}" onchange="onTetapModeChange('${escJs(item.id)}')"
              style="padding:5px 9px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;outline:none;background:#fff;">
              <option value="lunas">💰 Lunas — bayar sisa (${rp(sisa)})</option>
              <option value="angsur">📆 Angsur — cicil sebagian</option>
            </select>
            <input type="number" id="tetapAngsur_${esc(item.id)}" placeholder="Nominal angsur..." min="1" max="${sisa}"
              oninput="calcTotal()"
              style="display:none;width:160px;padding:5px 9px;border:1.5px solid var(--primary-light);border-radius:7px;font-size:12px;font-family:inherit;outline:none;">
          </div>`;
      }
    } else if (item.type === 'custom') {
      // Cabang ini dulu mengabaikan tagihan sepenuhnya: item custom yang sudah
      // lunas tetap tampil bercentang dengan kolom nominal kosong. Karena
      // submitPayment() mengecualikan tipe custom dari penjagaan `amount <= 0`,
      // mencentangnya akan mencatat baris pembayaran Rp 0 di kuitansi.
      if (tagih && tagih.nominal > 0 && (tagih.nominal - tagih.paid_amount) <= 0) {
        doneNote = { kind: 'lunas', text: 'Lunas ' + rp(tagih.nominal) };
      } else {
        extra = `<div class="pay-item-custom" style="margin-top:6px;"><input type="number" id="custom_${item.id}" placeholder="Nominal..." value="${amount||''}" oninput="calcTotal()" style="font-size:12px;padding:4px 8px;width:150px;"></div>`;
      }
    }

    // Baris tipis: tidak ada checkbox sama sekali. calcTotal(), submitPayment(),
    // dan selectAllTunggakan() sudah melewati item yang checkbox-nya tak ada.
    if (doneNote) {
      return `<div class="pay-item-done ${doneNote.kind === 'warn' ? 'is-warn' : 'is-lunas'}">
        <span class="pid-mark">${doneNote.kind === 'warn' ? '⚠️' : '✓'}</span>
        <span class="pid-name">${esc(item.name)}</span>
        <span class="pid-note">${esc(doneNote.text)}</span>
      </div>`;
    }

    return `<div class="pay-item">
      <input type="checkbox" id="chk_${item.id}" onchange="calcTotal()">
      <div class="pay-item-info">
        <div class="pay-item-name">${esc(item.name)}${item._fromTagihan ? ' <span style="font-size:10px;font-weight:700;color:var(--danger);background:var(--danger-pale);border-radius:5px;padding:1px 6px;vertical-align:middle;">tunggakan lama</span>' : ''}</div>
        <div class="pay-item-amount">${
          item.type === 'custom' ? 'Nominal custom'
          : item.type === 'tetap' && student
            // "(sisa)" hanya benar bila santri ini memang punya tagihannya.
            // Tanpa tagihan, angkanya adalah nominal baku item — belum ditagihkan.
            ? rp(amount) + `<span style="font-size:10px;font-weight:400;color:var(--text-muted);"> ${tagih ? '(sisa)' : '(belum ditagihkan)'}</span>`
            : rp(amount)
        }</div>
        ${extra}
      </div>
    </div>`;
  }).join('');

  // Blok tunggakan SPP tahun ajaran sebelumnya (dari spp_history) — hanya
  // muncul bila siswa terpilih & masih ada bulan yang belum dibayar tahun lalu.
  inputPrevArrears = student ? sppTunggakanPrevList(student) : [];
  if (inputPrevArrears.length) html += renderPrevArrearsBlock(inputPrevArrears);

  // Ringkasan seluruh tunggakan santri + tombol centang semua (di paling atas).
  cont.innerHTML = (student ? renderArrearsBanner(student, inputPrevArrears) : '') + html;
  calcTotal();
}

// Panel ringkas "semua tunggakan" santri terpilih: SPP tahun berjalan, SPP tiap
// tahun ajaran sebelumnya, dan tiap item tagihan yang masih bersisa — supaya
// petugas langsung melihat seluruh kewajiban tanpa menelusuri satu per satu.
function renderArrearsBanner(student, prevList) {
  const sppNow = sppTunggakan(student);
  // Hanya bulan yang sudah jatuh tempo (s/d bulan berjalan) yang dihitung —
  // sejalan dengan nominal sppNow.
  const bulanNow = (student.spp || 0) > 0 ? sppUnpaidDueMonths(student).length : 0;
  const tagihanRows = appState.tagihan
    .filter(t => t.nama === student.nama && Math.max(0, (t.nominal || 0) - (t.paid_amount || 0)) > 0)
    .map(t => ({ label: t.item_name, amount: Math.max(0, t.nominal - t.paid_amount) }));

  const baris = [];
  if (sppNow > 0) baris.push({ label: `SPP tahun berjalan (${bulanNow} bln)`, amount: sppNow });
  prevList.forEach(y => baris.push({ label: `SPP TA ${y.ta} (${y.unpaid.length} bln)`, amount: y.amount }));
  tagihanRows.forEach(r => baris.push(r));

  const total = baris.reduce((a, r) => a + r.amount, 0);
  if (total <= 0) {
    return `<div class="pay-item" style="display:block;border-color:var(--primary-light);background:var(--primary-pale);">
      <div style="font-weight:700;font-size:13px;color:var(--primary-light);">✅ Tidak ada tunggakan — seluruh kewajiban ${esc(student.nama)} sudah lunas</div>
    </div>`;
  }

  return `<div class="pay-item" style="display:block;border-color:var(--danger);background:#fff;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      <div style="font-weight:800;font-size:14px;color:var(--danger);">🧾 Total Seluruh Tunggakan: ${rp(total)}</div>
      <button type="button" class="btn btn-danger btn-sm" onclick="selectAllTunggakan()">✔️ Centang semua tunggakan</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:3px 12px;font-size:12px;">
      ${baris.map(r => `<div style="color:var(--text-muted);">${esc(r.label)}</div>
        <div style="font-weight:700;color:var(--danger);text-align:right;">${rp(r.amount)}</div>`).join('')}
    </div>
  </div>`;
}

// Centang sekaligus seluruh tunggakan santri terpilih: SPP tahun berjalan,
// semua bulan tunggakan TA sebelumnya, dan tiap item tagihan yang bersisa
// (mode "Lunas"). Item bernominal custom sengaja dilewati — nominalnya manual.
function selectAllTunggakan() {
  const student = getStudent(document.getElementById('inputNama').value);
  if (!student) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }

  getInputItems(student).forEach(item => {
    const chk = document.getElementById('chk_' + item.id);
    if (!chk || chk.disabled) return;
    if (item.type === 'tetap') {
      const t = findTagihan(student.nama, item.id);
      const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : (item.amount || 0);
      if (sisa <= 0) return;
      const mode = document.getElementById('tetapMode_' + item.id);
      if (mode) { mode.value = 'lunas'; onTetapModeChange(item.id); }
      chk.checked = true;
    } else if (item.type === 'bulanan') {
      // Hanya bulan yang benar-benar menunggak (sudah jatuh tempo) yang
      // dicentang — bulan bayar di muka tetap harus dipilih manual.
      const unpaid = sppUnpaidDueMonths(student);
      if (!unpaid.length || !(student.spp || item.amount || 0)) return;
      unpaid.forEach(m => setSppMonth(m, true));
      updateSppMonthInfo();
      chk.checked = true;
    }
  });

  const master = document.getElementById('chk_spp_prev');
  if (master) { master.checked = true; toggleAllSppPrev(master); }

  calcTotal();
  toast('✅ Semua tunggakan dicentang — periksa dulu sebelum menyimpan');
}

// Render kartu "Tunggakan SPP Tahun Ajaran Sebelumnya": tiap tahun ajaran
// menampilkan chip bulan yang belum dibayar (bisa dipilih sebagian).
function renderPrevArrearsBlock(list) {
  const totalAll  = list.reduce((a, y) => a + y.amount, 0);
  const totalBln  = list.reduce((a, y) => a + y.unpaid.length, 0);
  const rows = list.map((y, yi) => {
    // Nominal per bulan bisa berbeda dalam satu TA (mis. SPP naik di tengah
    // tahun) atau tersisa sebagian karena sudah diangsur — tampilkan apa adanya.
    const seragam = y.detail.every(d => d.sisa === y.detail[0].sisa);
    return `
    <div style="margin-top:10px;padding-top:10px;${yi > 0 ? 'border-top:1px dashed var(--border);' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
        <div style="font-size:12px;font-weight:700;">TA ${esc(y.ta)}
          ${y.kelas ? `<span style="font-weight:500;color:var(--text-muted);">· Kelas ${esc(y.kelas)}</span>` : ''}
          ${seragam ? `<span style="font-weight:500;color:var(--text-muted);">· ${rp(y.detail[0].sisa)}/bln</span>` : ''}</div>
        <span style="font-size:11px;font-weight:700;color:var(--danger);">${y.unpaid.length} bln · ${rp(y.amount)}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${y.detail.map(d => `
          <label style="display:flex;align-items:center;gap:4px;padding:4px 9px;border:1.5px solid var(--border);border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;transition:.15s;"
            id="sppPrevLabel_${yi}_${d.m}" onclick="toggleSppPrevMonth(${yi},'${d.m}',this)"
            title="${esc(MONTH_FULL[d.m])} — sisa ${rp(d.sisa)}${d.dibayar > 0 ? ' (sudah dibayar ' + rp(d.dibayar) + ' dari ' + rp(d.nominal) + ')' : ''}">
            <input type="checkbox" id="sppPrevChk_${yi}_${d.m}" value="${d.m}" style="display:none;">
            ${MONTH_FULL[d.m]}${seragam ? '' : ` <span style="font-size:10px;opacity:.75;">${rp(d.sisa)}</span>`}
          </label>`).join('')}
      </div>
    </div>`;
  }).join('');

  return `<div class="pay-item" style="display:block;border-color:var(--danger);background:var(--danger-pale);">
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <input type="checkbox" id="chk_spp_prev" onchange="toggleAllSppPrev(this)" title="Pilih semua bulan tunggakan">
      <div class="pay-item-info" style="flex:1;min-width:0;">
        <div class="pay-item-name" style="color:var(--danger);">⚠️ Tunggakan SPP Tahun Ajaran Sebelumnya</div>
        <div class="pay-item-amount" style="color:var(--danger);">${rp(totalAll)} <span style="font-size:10px;font-weight:400;color:var(--text-muted);">(${totalBln} bulan · ${list.length} tahun ajaran)</span></div>
        ${rows}
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted);" id="sppPrevInfo">Belum ada bulan dipilih</div>
      </div>
    </div>
  </div>`;
}

// Warnai chip bulan tunggakan sesuai status pilih.
function styleSppPrevLabel(labelEl, on) {
  if (!labelEl) return;
  labelEl.style.background   = on ? 'var(--danger)' : '';
  labelEl.style.color        = on ? '#fff' : '';
  labelEl.style.borderColor  = on ? 'var(--danger)' : '';
}

function toggleSppPrevMonth(yi, m, labelEl) {
  const chk = document.getElementById(`sppPrevChk_${yi}_${m}`);
  if (!chk) return;
  chk.checked = !chk.checked;
  styleSppPrevLabel(labelEl, chk.checked);
  updateSppPrevInfo();
  calcTotal();
}

// Checkbox induk: pilih / batal semua bulan tunggakan tahun lalu sekaligus.
function toggleAllSppPrev(master) {
  inputPrevArrears.forEach((y, yi) => y.unpaid.forEach(m => {
    const chk = document.getElementById(`sppPrevChk_${yi}_${m}`);
    if (chk) chk.checked = master.checked;
    styleSppPrevLabel(document.getElementById(`sppPrevLabel_${yi}_${m}`), master.checked);
  }));
  updateSppPrevInfo();
  calcTotal();
}

// Bulan tunggakan tahun lalu yang dicentang, dikelompokkan per tahun ajaran.
// Nominal diambil dari sisa tiap bulan (bukan rate × jumlah bulan) agar tetap
// benar saat nominal SPP berbeda antar bulan atau bulan itu sudah diangsur.
function getSppPrevSelected() {
  const out = [];
  inputPrevArrears.forEach((y, yi) => {
    const picked = y.detail.filter(d => document.getElementById(`sppPrevChk_${yi}_${d.m}`)?.checked);
    if (!picked.length) return;
    const bulanAmounts = {};
    picked.forEach(d => { bulanAmounts[d.m] = d.sisa; });
    out.push({
      ta: y.ta, rate: y.rate,
      months: picked.map(d => d.m),
      amount: picked.reduce((a, d) => a + d.sisa, 0),
      bulanAmounts,
    });
  });
  return out;
}

function updateSppPrevInfo() {
  const info = document.getElementById('sppPrevInfo');
  const sel = getSppPrevSelected();
  const totalMonths = sel.reduce((a, y) => a + y.months.length, 0);
  const totalAmt    = sel.reduce((a, y) => a + y.amount, 0);
  if (info) {
    info.textContent = totalMonths
      ? `${totalMonths} bulan dipilih · ${rp(totalAmt)}`
      : 'Belum ada bulan dipilih';
    info.style.color = totalMonths ? 'var(--danger)' : 'var(--text-muted)';
  }
  // Sinkronkan status checkbox induk (checked / indeterminate)
  const master = document.getElementById('chk_spp_prev');
  if (master) {
    const totalUnpaid = inputPrevArrears.reduce((a, y) => a + y.unpaid.length, 0);
    master.checked = totalMonths > 0 && totalMonths === totalUnpaid;
    master.indeterminate = totalMonths > 0 && totalMonths < totalUnpaid;
  }
}

function styleSppMonthLabel(labelEl, on) {
  if (!labelEl) return;
  // Saat tidak terpilih, kembalikan ke warna asalnya: merah untuk bulan yang
  // sudah jatuh tempo (tunggakan), abu-abu untuk bulan bayar di muka.
  const m = (labelEl.id || '').replace('sppMonthLabel_', '');
  const jatuhTempo = isSppDue(m);
  labelEl.style.background  = on ? 'var(--primary)' : '';
  labelEl.style.color       = on ? '#fff' : (jatuhTempo ? 'var(--danger)' : 'var(--text-muted)');
  labelEl.style.borderColor = on ? 'var(--primary)' : (jatuhTempo ? 'var(--danger)' : 'var(--border)');
}

function updateSppMonthInfo() {
  const selected = getSppMonthsSelected();
  const info = document.getElementById('sppMonthInfo');
  if (!info) return;
  info.textContent = selected.length
    ? selected.length + ' bulan dipilih: ' + selected.map(m => MONTH_FULL[m]).join(', ')
    : 'Belum ada bulan dipilih';
  info.style.color = selected.length ? 'var(--primary-light)' : 'var(--text-muted)';
}

// Set satu bulan SPP tahun berjalan tanpa toggle (dipakai "Centang semua tunggakan").
function setSppMonth(m, on) {
  const chk = document.getElementById('sppChk_' + m);
  if (!chk) return;
  chk.checked = !!on;
  styleSppMonthLabel(document.getElementById('sppMonthLabel_' + m), !!on);
}

function toggleSppMonth(m, labelEl) {
  const chk = document.getElementById('sppChk_' + m);
  if (!chk) return;
  chk.checked = !chk.checked;
  styleSppMonthLabel(labelEl, chk.checked);
  updateSppMonthInfo();
  calcTotal();
}

function getSppMonthsSelected() {
  return MONTHS.filter(m => document.getElementById('sppChk_' + m)?.checked);
}

// Toggle input angsur untuk item tetap saat mode Lunas/Angsur diganti.
function onTetapModeChange(itemId) {
  const mode = document.getElementById('tetapMode_' + itemId)?.value;
  const inp  = document.getElementById('tetapAngsur_' + itemId);
  if (inp) {
    inp.style.display = mode === 'angsur' ? 'inline-block' : 'none';
    if (mode === 'angsur') setTimeout(() => inp.focus(), 0);
    else inp.value = '';
  }
  calcTotal();
}

// Nominal yang akan dibayar untuk satu item tetap (hormati mode Lunas/Angsur).
function tetapAmountToPay(item, student) {
  const t = findTagihan(student.nama, item.id);
  const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : (item.amount || 0);
  const mode = document.getElementById('tetapMode_' + item.id)?.value || 'lunas';
  if (mode === 'angsur') {
    const inp = document.getElementById('tetapAngsur_' + item.id);
    return Math.min(sisa, Math.max(0, Number(inp?.value || 0)));
  }
  return sisa;
}

function calcTotal() {
  let total = 0;
  const student = getStudent(document.getElementById('inputNama').value);
  getInputItems(student).forEach(item => {
    const chk = document.getElementById('chk_'+item.id);
    if (!chk || !chk.checked) return;
    if (item.type === 'custom') {
      const inp = document.getElementById('custom_'+item.id);
      total += Number(inp?.value||0);
    } else if (item.type === 'bulanan' && student) {
      const bulanDipilih = getSppMonthsSelected();
      const sppRate = student.spp || item.amount || 0;
      total += sppRate * Math.max(1, bulanDipilih.length);
    } else if (item.type === 'tetap' && student) {
      total += tetapAmountToPay(item, student);
    } else {
      total += item.amount||0;
    }
  });
  // Tunggakan SPP tahun ajaran sebelumnya (dipilih per bulan)
  getSppPrevSelected().forEach(y => total += y.amount);
  document.getElementById('inputTotal').textContent = rp(total);
}

async function submitPayment() {
  const nama = document.getElementById('inputNama').value;
  if (!nama) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const student = getStudent(nama);
  const items = [];
  getInputItems(student).forEach(item => {
    const chk = document.getElementById('chk_'+item.id);
    if (!chk || !chk.checked) return;
    let amount = item.amount;
    let payName = item.name;
    if (item.type === 'custom') {
      const inp = document.getElementById('custom_'+item.id);
      amount = Number(inp?.value||0);
    } else if (item.type === 'bulanan' && student) {
      amount = student.spp || item.amount || 0;
    } else if (item.type === 'tetap' && student) {
      const t = findTagihan(student.nama, item.id);
      const sisa = t ? Math.max(0, t.nominal - t.paid_amount) : (item.amount || 0);
      amount = tetapAmountToPay(item, student);
      // Tandai "(Angsur)" bila membayar sebagian (belum melunasi sisa)
      if (amount > 0 && amount < sisa) payName = item.name + ' (Angsur)';
    }
    if (amount <= 0 && item.type !== 'custom') return;

    if (item.type === 'bulanan') {
      const bulanDipilih = getSppMonthsSelected();
      if (!bulanDipilih.length) { toast('⚠️ Pilih minimal 1 bulan SPP!'); items.length = 0; return; }
      const totalSPP = (student.spp || item.amount || 0) * bulanDipilih.length;
      items.push({ id: item.id, type: item.type, name: item.name, amount: totalSPP, bulanList: bulanDipilih });
    } else {
      items.push({ id: item.id, type: item.type, name: payName, amount, bulan: null });
    }
  });

  // Tunggakan SPP tahun ajaran sebelumnya (dari spp_history) — tiap TA jadi
  // satu item pembayaran tersendiri, bulan dibayar dicatat balik ke history.
  const prevSel = getSppPrevSelected();
  if (!items.length && !prevSel.length) { toast('⚠️ Centang minimal 1 item bayar!'); return; }
  prevSel.forEach(y => {
    items.push({ id: 'spp', type: 'spp_prev', name: `SPP Tunggakan TA ${y.ta}`,
      amount: y.amount, ta: y.ta, rate: y.rate, bulanList: y.months, bulanAmounts: y.bulanAmounts });
  });

  // Kumpulkan perubahan sebagai SELISIH (bulan baru & nominal tambahan), lalu
  // digabungkan ke kondisi terbaru di server. Jangan menghitung nilai akhir
  // dari salinan lokal: bila device lain sudah menginput lebih dulu, salinan
  // lokal sudah usang dan pembayaran mereka akan tertimpa.
  const sppMonthsBaru = [];              // bulan SPP tahun berjalan
  const sppHistBaru   = {};              // { ta: { rate, months: [] } }
  const tagihanUpdates = [];             // { id, delta }
  items.forEach(it => {
    if (it.type === 'spp_prev') {
      const rec = sppHistBaru[it.ta] || (sppHistBaru[it.ta] = { rate: it.rate, months: [] });
      (it.bulanList || []).forEach(b => { if (!rec.months.includes(b)) rec.months.push(b); });
    } else if (it.bulanList?.length) {
      it.bulanList.forEach(b => { if (!sppMonthsBaru.includes(b)) sppMonthsBaru.push(b); });
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
  appState.transactions.push(txn);
  // Tulis-gabung ke server (baca kondisi terbaru → tambahkan perubahan ini).
  // Ditunggu (await) agar ringkasan santri & tabel sesi menampilkan angka yang
  // benar-benar tersimpan, bukan tebakan lokal.
  await commitSppPayment(nama, sppMonthsBaru, sppHistBaru);
  await Promise.all(tagihanUpdates.map(u => addTagihanPaid(u.id, u.delta).catch(console.error)));
  saveTransaction(txn);

  // Render session table
  const tbody = document.querySelector('#sessionTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${esc(nama)}</strong></td><td>${esc(student.kelas)}</td><td>${esc(items.map(i=>i.name+(i.bulanList?.length?' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')':i.bulan?' ('+MONTH_FULL[i.bulan]+')':'')).join(', '))}</td><td><strong>${rp(totalAmt)}</strong></td><td>${esc(timeStr)}</td><td style="white-space:nowrap;"><button class="btn btn-primary btn-sm" onclick="cetakKuitansiById('${escJs(nama)}','${escJs(timeStr)}')">🖨️ Kuitansi</button> <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">✕</button></td>`;
  if(tbody.firstChild?.tagName==='TR' && tbody.firstChild.querySelector('[colspan]')) tbody.innerHTML='';
  tbody.prepend(row);

  // Simpan ke tabel kuitansi Supabase (await agar ID tersedia saat cetak)
  const noKwt = await generateNoKuitansi();
  const kwtData = {
    no_kuitansi: noKwt,
    nama, kelas: student.kelas, nisn: student.nisn||'',

    // Rincian per bulan: pakai nominal asli tiap bulan bila ada (tunggakan lama
    // bisa beda nominal per bulan / sisa angsuran), selain itu bagi rata.
    items: items.flatMap(i => {
      if (i.bulanList?.length) return i.bulanList.map(b => ({
        item_id: i.id, name: i.name,
        amount: (i.bulanAmounts && i.bulanAmounts[b] != null) ? i.bulanAmounts[b] : i.amount / i.bulanList.length,
        bulan: b,
      }));
      return [{ item_id: i.id, name: i.name, amount: i.amount, bulan: i.bulan || null }];
    }),
    total: totalAmt, catatan: txn.catatan, dicetak: false,
    ta_label: getProfil().ta || '',
    metode: meta.metode, dibayar_oleh: meta.dibayar_oleh, tgl_bayar: timeStr,
  };
  try {
    const res = await insertKuitansi(kwtData);
    pendingKwtId = res?.[0]?.id || null;
  } catch { pendingKwtId = null; }

  pendingKwtData = { ...kwtData, time: timeStr };

  // Reset form
  document.getElementById('inputNama').value='';
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) { searchEl.value=''; searchEl.style.borderColor=''; }
  document.getElementById('inputKelas').textContent='—';
  document.getElementById('inputNISN').textContent='—';
  document.getElementById('studentSummary').innerHTML='';
  document.getElementById('inputCatatan').value='';
  resetPaymentMeta();
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
    @media print { body { margin:0; } .no-print { display:none !important; } }
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
