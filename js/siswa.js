// ── SiPay · Halaman Data Siswa ──
// ── Tab Data Siswa ──
function switchSiswaTab(tab) {
  const isDaftar = tab === 'daftar';
  document.getElementById('tabSiswaDaftar').style.display = isDaftar ? 'block' : 'none';
  document.getElementById('tabSiswaLog').style.display    = isDaftar ? 'none'  : 'block';
  document.getElementById('tabSiswaBtn').style.background = isDaftar ? 'var(--primary)' : 'transparent';
  document.getElementById('tabSiswaBtn').style.color      = isDaftar ? '#fff' : 'var(--text-muted)';
  document.getElementById('tabLogBtn').style.background   = isDaftar ? 'transparent' : 'var(--primary)';
  document.getElementById('tabLogBtn').style.color        = isDaftar ? 'var(--text-muted)' : '#fff';
  if (!isDaftar) renderLogSiswa();
}

let logPage = 1;
const LOG_PER_PAGE = 50;

async function renderLogSiswa(resetPage = true) {
  const wrap = document.getElementById('logSiswaWrap');
  if (!wrap) return;
  if (resetPage) logPage = 1;
  wrap.innerHTML = '<div class="text-center text-muted p-32">Memuat...</div>';

  const q    = (document.getElementById('logSearch')?.value || '').toLowerCase().trim();

  try {
    let url = 'transactions?select=*&order=created_at.desc&limit=500';
    let rows = await sb(url);

    if (q) rows = rows.filter(r => r.nama?.toLowerCase().includes(q) || r.jenis?.toLowerCase().includes(q));

    const total      = rows.length;
    const totalPages = Math.ceil(total / LOG_PER_PAGE) || 1;
    const start      = (logPage - 1) * LOG_PER_PAGE;
    const pageRows   = rows.slice(start, start + LOG_PER_PAGE);

    if (!rows.length) {
      wrap.innerHTML = '<div class="text-center text-muted p-32 fs-13">Belum ada transaksi tercatat.</div>';
      return;
    }

    const fmt = n => Number(n||0).toLocaleString('id-ID');

    const grouped = {};
    pageRows.forEach(r => {
      const tgl = r.created_at
        ? new Date(r.created_at).toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
        : r.time || '—';
      if (!grouped[tgl]) grouped[tgl] = [];
      grouped[tgl].push(r);
    });

    const listHtml = Object.entries(grouped).map(([tgl, txns]) => `
      <div class="mb-20">
        <div class="fs-12 fw-700 text-muted mb-8 pb-6 border-b-1-border">
          <svg class="ic"><use href="#i-cal"/></svg> ${tgl}
        </div>
        ${txns.map(r => {
          const jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : r.time?.split(' ')[1] || '—';
          return `<div class="log-row">
            <div class="fs-12 text-muted nowrap minw-40">${jam}</div>
            <div class="flex-1 minw-0">
              <div class="fw-700 fs-13">${esc(r.nama)} <span class="fw-400 text-muted">— ${esc(r.kelas)}</span></div>
              <div class="fs-12 text-555 mt-2">${esc(r.jenis)}</div>
              ${r.catatan ? `<div class="hint mt-2"><svg class="ic"><use href="#i-msg"/></svg> ${esc(r.catatan)}</div>` : ''}
            </div>
            <div class="text-right nowrap">
              <div class="fw-700 fs-14 text-primary-light">Rp ${fmt(r.nominal)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('');

    const pagCtrl = totalPages > 1 ? `
      <div class="flex items-center justify-center gap-8 mt-16 fs-13">
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage-1})" ${logPage<=1?'disabled':''}>← Prev</button>
        <span class="text-muted">Hal ${logPage} / ${totalPages} &nbsp;(${total} transaksi)</span>
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage+1})" ${logPage>=totalPages?'disabled':''}>Next →</button>
      </div>` : `<div class="text-center fs-12 text-muted mt-8">${total} transaksi</div>`;

    wrap.innerHTML = listHtml + pagCtrl;

  } catch(e) {
    wrap.innerHTML = `<div class="text-danger p-16 fs-13">Gagal memuat: ${e.message}</div>`;
  }
}

function logGoPage(page) {
  logPage = page;
  renderLogSiswa(false);
}

let siswaPage = 1;
const SISWA_PER_PAGE = 50;

const STATUS_KELULUSAN_BADGE = {
  lulus:  { label: 'Lulus',  cls: 'badge-green',  icon: '<svg class="ic"><use href="#i-grad"/></svg>' },
  pindah: { label: 'Pindah', cls: 'badge-yellow', icon: '<svg class="ic"><use href="#i-refresh"/></svg>' },
  keluar: { label: 'Keluar', cls: 'badge-red',    icon: '<svg class="ic"><use href="#i-logout"/></svg>' },
};

// withTagihanIndex: selama menggambar, pencarian tagihan per santri memakai
// indeks Map — bukan memindai ulang seluruh appState.tagihan tiap baris.
function renderSiswaTable(resetPage = true) {
  return withTagihanIndex(() => _renderSiswaTable(resetPage));
}
function _renderSiswaTable(resetPage) {
  if (resetPage) siswaPage = 1;
  const q = document.getElementById('searchSiswa').value.toLowerCase();
  const sFilter = document.getElementById('filterStatus').value;
  const skFilter = document.getElementById('filterStatusKelulusan')?.value || '';
  let list = appState.students.filter(s => {
    if (q && !s.nama.toLowerCase().includes(q) && !s.nisn?.includes(q)) return false;
    if (activeKelasFilter && s.kelas !== activeKelasFilter) return false;
    if (sFilter === 'lunas' && totalTunggakan(s) > 0) return false;
    if (sFilter === 'tunggak' && totalTunggakan(s) === 0) return false;
    // Default: sembunyikan siswa tidak aktif kecuali filter eksplisit dipilih
    if (skFilter === '' && s.status_kelulusan) return false;
    if (skFilter === 'aktif' && s.status_kelulusan) return false;
    if (skFilter && skFilter !== 'aktif' && skFilter !== 'semua' && s.status_kelulusan !== skFilter) return false;
    return true;
  });
  clearSelection();

  const total      = list.length;
  const totalPages = Math.ceil(total / SISWA_PER_PAGE) || 1;
  const start      = (siswaPage - 1) * SISWA_PER_PAGE;
  const pageList   = list.slice(start, start + SISWA_PER_PAGE);

  const tbody = document.querySelector('#siswaTable tbody');
  tbody.innerHTML = pageList.map((s, i) => {
    const tunggak = totalTunggakan(s);
    // Agregat tagihan item (tetap) — pangkal/buku/seragam dll kini disimpan di tabel tagihan
    const tagT       = tagihanOf(s.nama);
    const tagNominal = tagT.reduce((a, t) => a + (t.nominal || 0), 0);
    const tagPaid    = tagT.reduce((a, t) => a + (t.paid_amount || 0), 0);
    const history = s.spp_history || {};
    const taKeys  = Object.keys(history).sort((a,b) => parseInt(a.split('/')[0]) - parseInt(b.split('/')[0]));
    let monthBadges;
    if (taKeys.length > 1) {
      monthBadges = taKeys.map(ta => {
        // Lunas bila tak ada satu pun bulan bersisa pada TA tersebut. Dihitung
        // lewat sppHistMonths agar TA yang hanya ditagih sebagian bulan (mis.
        // santri masuk di tengah tahun) tidak keliru dianggap menunggak.
        const lunas = !sppHistMonths(history[ta]).some(x => x.sisa > 0);
        const short = ta.replace(/20(\d\d)\/20(\d\d)/, '$1/$2');
        return `<span class="ta-chip ${lunas?'is-ok':'is-due'}">${short}: ${lunas?'<svg class="ic"><use href="#i-check"/></svg>':'<svg class="ic"><use href="#i-alert"/></svg>'}</span>`;
      }).join('');
    } else {
      // Lunas = hijau, menunggak (sudah jatuh tempo) = merah,
      // belum jatuh tempo = abu-abu (tidak dihitung tunggakan), dan bulan
      // sebelum santri masuk = pudar (tidak pernah ditagih).
      const mulaiTtl = sppMulaiLabel(s) ? `Sebelum masuk (SPP mulai ${sppMulaiLabel(s)})` : '';
      monthBadges = MONTHS.map(m => {
        const paid   = (s.spp_paid_months||[]).includes(m);
        const sebelum = !paid && isSppSebelumMasuk(s, m);
        const due    = !sebelum && isSppDueFor(s, m);
        const st   = paid ? 'is-paid' : due ? 'is-due' : 'is-future';
        const ang  = paid ? 0 : sppBulanDibayar(s, m);
        const ttl  = (paid ? 'Lunas' : sebelum ? mulaiTtl : due ? 'Belum bayar (jatuh tempo)' : 'Belum jatuh tempo')
          + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
        return `<span title="${esc(ttl)}" class="mchip ${st}${ang > 0 ? ' is-angsur' : ''}${sebelum ? ' is-before' : ''}">${m}</span>`;
      }).join('');
    }
    const nama_safe = escJs(s.nama);
    const no = start + i + 1;
    const sk = s.status_kelulusan || '';
    const skBadge = sk && STATUS_KELULUSAN_BADGE[sk]
      ? `<span class="badge ${STATUS_KELULUSAN_BADGE[sk].cls} ml-4">${STATUS_KELULUSAN_BADGE[sk].icon} ${STATUS_KELULUSAN_BADGE[sk].label}</span>`
      : '';
    return `<tr${sk ? ' class="row-nonaktif"' : ''}>
      <td class="chk-col"><input type="checkbox" class="row-chk" data-nama="${esc(s.nama)}" onchange="toggleRowSelect(this)"></td>
      <td>${no}</td>
      <td><strong>${esc(s.nama)}</strong>${skBadge}</td>
      <td>${esc(kelasLabel(s))}</td>
      <td>${rp(s.spp)}</td>
      <td><div class="lh-16">${monthBadges}</div></td>
      <td>
        <div>${rp(tagPaid)} / ${rp(tagNominal)}</div>
        <div class="progress-wrap mt-4"><div class="progress-bar ${pct(tagPaid,tagNominal)>=100?'green':'yellow'}" style="width:${pct(tagPaid,tagNominal)}%"></div></div>
      </td>
      <td>${tunggak>0?`<span class="badge badge-red">Tunggak ${rp(tunggak)}</span>`:'<span class="badge badge-green">✓ Lunas</span>'}</td>
      <td class="nowrap">
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nama_safe}')" title="Detail"><svg class="ic"><use href="#i-clip"/></svg> Detail</button>
        <button class="btn btn-accent btn-sm" onclick="openEditSiswa('${nama_safe}')" title="Edit data"><svg class="ic"><use href="#i-edit"/></svg> Edit</button>
        <button class="btn btn-danger btn-sm act-del" onclick="deleteSingle('${nama_safe}')" title="Hapus"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td class="text-center p-20 text-muted" colspan="9">Tidak ada data</td></tr>';

  // Pagination controls
  const existingPag = document.getElementById('siswaPagination');
  if (existingPag) existingPag.remove();
  if (totalPages > 1) {
    const pag = document.createElement('div');
    pag.id = 'siswaPagination';
    pag.className = 'pagination';
    pag.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="siswaGoPage(${siswaPage-1})" ${siswaPage<=1?'disabled':''}>← Prev</button>
      <span class="text-muted">Hal ${siswaPage} / ${totalPages} &nbsp;(${total} santri)</span>
      <button class="btn btn-outline btn-sm" onclick="siswaGoPage(${siswaPage+1})" ${siswaPage>=totalPages?'disabled':''}>Next →</button>`;
    document.querySelector('#siswaTable').after(pag);
  }
}

function siswaGoPage(page) {
  siswaPage = page;
  renderSiswaTable(false);
}

// ── TUNGGAKAN ──
let tunggakanSuggIdx = -1;

const TUNGGAKAN_LIMIT = 50;
let tunggakanShowAll = false;   // direset saat halaman Tunggakan dibuka lagi
function renderTunggakan() {
  return withTagihanIndex(_renderTunggakan);
}
function _renderTunggakan() {
  const ss = appState.students;
  const withTk = ss.filter(s => totalTunggakan(s) > 0);
  const totalTk = withTk.reduce((a,s) => a + totalTunggakan(s), 0);
  const sppTk   = ss.reduce((a,s) => a + sppTunggakan(s), 0);
  const sppPrevTk = ss.reduce((a,s) => a + sppTunggakanPrev(s), 0);

  // Hitung tunggakan per item dari tagihan
  const itemStats = {};
  appState.tagihan.forEach(t => {
    const sisa = Math.max(0, t.nominal - t.paid_amount);
    if (sisa <= 0) return;
    if (!itemStats[t.item_id]) itemStats[t.item_id] = { name: t.item_name, total: 0, count: 0 };
    itemStats[t.item_id].total += sisa;
    itemStats[t.item_id].count += 1;
  });

  const el = document.getElementById('tunggakanStats');
  if (!el) return;

  const itemCards = Object.values(itemStats).map(it => `
    <div class="stat-card blue">
      <div class="stat-label">Tunggakan ${esc(it.name)}</div>
      <div class="stat-value fs-18">${rp(it.total)}</div>
      <div class="stat-sub">${it.count} santri</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-clip"/></svg></div>
    </div>`).join('');

  el.innerHTML = `
    <div class="stat-card red">
      <div class="stat-label">Total Tunggakan</div>
      <div class="stat-value fs-18">${rp(totalTk)}</div>
      <div class="stat-sub">${withTk.length} santri belum lunas</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-alert"/></svg></div>
    </div>
    <div class="stat-card gold">
      <div class="stat-label">Tunggakan SPP</div>
      <div class="stat-value fs-18">${rp(sppTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakan(s)>0).length} santri${sppDueMonthLabel() ? ' · s/d ' + esc(sppDueMonthLabel()) : ''}</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-cal"/></svg></div>
    </div>
    ${sppPrevTk > 0 ? `
    <div class="stat-card red">
      <div class="stat-label">Tunggakan SPP Th. Lalu</div>
      <div class="stat-value fs-18">${rp(sppPrevTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakanPrev(s)>0).length} santri</div>
      <div class="stat-icon"><svg class="ic"><use href="#i-cal"/></svg></div>
    </div>` : ''}
    ${itemCards}
  `;
  document.getElementById('tunggakanDetail').innerHTML = '';
  // Daftar santri aktif yang menunggak, terbesar di atas — tidak perlu ketik nama dulu
  const daftar = ss.filter(isSantriAktif).map(s => ({ s, tk: totalTunggakan(s) }))
    .filter(x => x.tk > 0).sort((a, b) => b.tk - a.tk);
  // Ribuan baris sekaligus membuat browser lambat menggambar (≈0,8 dtk untuk
  // 3000 santri) — tampilkan yang terbesar dulu, sisanya lewat tombol.
  const tampil = tunggakanShowAll ? daftar : daftar.slice(0, TUNGGAKAN_LIMIT);
  const sisa = daftar.length - tampil.length;
  document.querySelector('#tunggakanTable tbody').innerHTML = (daftar.length
    ? tampil.map(({ s, tk }, i) => {
        const nSpp = sppUnpaidDueMonths(s).length;
        const n = escJs(s.nama);
        return `<tr>
          <td>${i + 1}</td>
          <td><strong>${esc(s.nama)}</strong></td>
          <td>${esc(kelasLabel(s))}</td>
          <td>${nSpp ? nSpp + ' bulan' : '<span class="text-muted">—</span>'}</td>
          <td class="text-right text-danger fw-700">${rp(tk)}</td>
          <td class="text-right nowrap">
            <button class="btn btn-outline btn-sm" onclick="selectTunggakanStudent('${n}');document.getElementById('tunggakanDetail').scrollIntoView({behavior:'smooth'})"><svg class="ic"><use href="#i-search"/></svg> Rincian</button>
            <button class="btn btn-primary btn-sm" onclick="quickInput('${n}')"><svg class="ic"><use href="#i-card"/></svg> Bayar</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td class="empty-row" colspan="6"><svg class="ic"><use href="#i-check"/></svg> Semua santri aktif sudah lunas</td></tr>')
    + (sisa > 0 ? `<tr><td class="empty-row" colspan="6"><button class="btn btn-outline btn-sm" onclick="tunggakanShowAll=true;renderTunggakan()">Tampilkan semua (${sisa} lagi)</button></td></tr>` : '');
  const inp = document.getElementById('searchTunggakan');
  if (inp) inp.value = '';
  hideTunggakanDropdown();
}

function onTunggakanSearch() {
  tunggakanSuggIdx = -1;
  const q = document.getElementById('searchTunggakan').value.trim().toLowerCase();
  const dd = document.getElementById('tunggakanDropdown');
  if (!q) { hideTunggakanDropdown(); return; }

  const matches = appState.students.filter(s =>
    s.nama.toLowerCase().includes(q)
  ).slice(0, 10);

  if (!matches.length) {
    dd.innerHTML = `<div class="p-14-16 fs-13 text-muted">Tidak ditemukan</div>`;
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = matches.map((s, i) => {
    const tk = totalTunggakan(s);
    const badge = tk > 0
      ? `<span class="fs-12 fw-700 text-danger bg-danger-pale p-2-8 rounded-20">Tunggak ${rp(tk)}</span>`
      : `<span class="fs-12 fw-700 text-primary-light bg-primary-pale p-2-8 rounded-20">✓ Lunas</span>`;
    return `<div class="tk-sugg-item sugg-row-tk" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectTunggakanStudent('${escJs(s.nama)}')"
      onmouseenter="hoverTunggakanItem(${i})"
     >
      <div>
        <div class="fw-600 fs-13-5">${esc(s.nama)}</div>
        <div class="fs-12 text-muted mt-1">${esc(kelasLabel(s))}</div>
      </div>
      ${badge}
    </div>`;
  }).join('');
  dd.style.display = 'block';
}

function hoverTunggakanItem(idx) {
  tunggakanSuggIdx = idx;
  document.querySelectorAll('.tk-sugg-item').forEach((el, i) => {
    el.style.background = i === idx ? 'var(--primary-pale)' : '';
  });
}

function onTunggakanKeydown(e) {
  const items = document.querySelectorAll('.tk-sugg-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    tunggakanSuggIdx = Math.min(tunggakanSuggIdx + 1, items.length - 1);
    items.forEach((el, i) => el.style.background = i === tunggakanSuggIdx ? 'var(--primary-pale)' : '');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    tunggakanSuggIdx = Math.max(tunggakanSuggIdx - 1, 0);
    items.forEach((el, i) => el.style.background = i === tunggakanSuggIdx ? 'var(--primary-pale)' : '');
  } else if (e.key === 'Enter' && tunggakanSuggIdx >= 0) {
    const nama = items[tunggakanSuggIdx].dataset.nama;
    selectTunggakanStudent(nama);
  } else if (e.key === 'Escape') {
    hideTunggakanDropdown();
  }
}

function hideTunggakanDropdown() {
  const dd = document.getElementById('tunggakanDropdown');
  if (dd) dd.style.display = 'none';
}

function selectTunggakanStudent(nama) {
  const s = appState.students.find(x => x.nama === nama);
  if (!s) return;
  document.getElementById('searchTunggakan').value = s.nama;
  hideTunggakanDropdown();
  renderTunggakanDetail(s);
}

function renderTunggakanDetail(s) {
  const nameSafe = escJs(s.nama);
  const headerBar = `
    <div class="flex items-start justify-between mb-20 flex-wrap gap-12">
      <div>
        <div class="fs-20 fw-800 text-primary">${esc(s.nama)}</div>
        <div class="fs-13 text-muted mt-3">${esc(kelasLabel(s))} &nbsp;•&nbsp; NISN: ${esc(s.nisn || '—')}</div>
      </div>
      <div class="flex gap-8 flex-wrap">
        <button class="btn btn-primary btn-sm" onclick="quickInput('${nameSafe}')"><svg class="ic"><use href="#i-card"/></svg> Bayar Sekarang</button>
        <button class="btn btn-outline btn-sm" onclick="openEditPembayaran('${nameSafe}')"><svg class="ic"><use href="#i-edit"/></svg> Edit Pembayaran</button>
        <button class="btn btn-outline btn-sm" onclick="openTunggakanLamaModal('${nameSafe}')"><svg class="ic"><use href="#i-cal"/></svg> Tunggakan TA Lama</button>
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nameSafe}')"><svg class="ic"><use href="#i-clip"/></svg> Detail Lengkap</button>
      </div>
    </div>`;

  const sppT   = sppTunggakan(s);
  const prevT  = sppTunggakanPrev(s);
  const prevList = sppTunggakanPrevList(s);
  const itemT  = itemsTunggakan(s);
  const totalT = sppT + prevT + itemT;

  // SPP bulan grid — tiga status: lunas, menunggak (sudah jatuh tempo),
  // dan belum jatuh tempo (tidak dihitung sebagai tunggakan).
  const bulanLunas = MONTHS.filter(m => (s.spp_paid_months||[]).includes(m));
  const bulanBelum = sppUnpaidDueMonths(s);
  const mulaiLabel = sppMulaiLabel(s);
  const monthGrid  = MONTHS.map(m => {
    const paid    = (s.spp_paid_months||[]).includes(m);
    const sebelum = !paid && isSppSebelumMasuk(s, m);
    const due     = !sebelum && isSppDueFor(s, m);
    const st     = paid ? 'is-paid' : due ? 'is-due' : 'is-future';
    const ang    = paid ? 0 : sppBulanDibayar(s, m);
    const ttl    = (paid ? 'Lunas'
      : sebelum ? `Sebelum masuk — tidak ditagih (SPP mulai ${mulaiLabel})`
      : due ? 'Belum bayar (sudah jatuh tempo)' : 'Belum jatuh tempo')
      + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
    return `<div title="${esc(ttl)}" class="mbox ${st}${ang > 0 ? ' is-angsur' : ''}${sebelum ? ' is-before' : ''}">${m}${ang > 0 ? `<div class="fs-12 fw-500">sisa ${rp(sppBulanSisa(s, m))}</div>` : ''}</div>`;
  }).join('');

  // Riwayat berlabel TA berjalan tidak ikut dihitung (lihat sppTunggakanPrevList)
  // — beri tahu admin supaya datanya dirapikan lewat editor "Tunggakan TA Lama",
  // bukan dibiarkan menggantung tanpa penjelasan.
  const taBentrok = (typeof sppHistTaBentrok === 'function') ? sppHistTaBentrok(s) : [];
  const bentrokNote = taBentrok.length ? `
    <div class="warn-box-spp">
      <svg class="ic"><use href="#i-alert"/></svg> <strong>Riwayat TA ${taBentrok.map(esc).join(', ')}</strong> berlabel tahun ajaran berjalan, jadi <strong>tidak dihitung</strong> sebagai tunggakan TA sebelumnya —
      tagihan tahun berjalan sudah dihitung lewat SPP di atas. Rapikan lewat tombol <strong><svg class="ic"><use href="#i-cal"/></svg> Tunggakan TA Lama</strong>.
    </div>` : '';

  // Rincian tunggakan SPP tiap tahun ajaran sebelumnya (bulan + nominal sisa)
  const prevGrids = bentrokNote + (prevList.length ? `
    <div class="mb-8 fw-700 fs-13 text-danger"><svg class="ic"><use href="#i-cal"/></svg> Tunggakan SPP Tahun Ajaran Sebelumnya</div>
    ${prevList.map(y => `
      <div class="bg-danger-pale rounded-12 p-12-14 mb-10">
        <div class="flex justify-between gap-8 flex-wrap mb-8">
          <div class="fs-13 fw-700">TA ${esc(y.ta)}${y.kelas ? ` · Kelas ${esc(y.kelas)}` : ''}</div>
          <div class="fs-13 fw-800 text-danger">${y.unpaid.length} bln · ${rp(y.amount)}</div>
        </div>
        <div class="flex flex-wrap gap-5">
          ${y.detail.map(d => `<span class="fs-12 fw-600 bg-white border-1-5-danger text-danger rounded-7 p-3-8">
            ${MONTH_FULL[d.m]} · ${rp(d.sisa)}${d.dibayar > 0 ? ' <span class="fw-400">(angsuran ' + rp(d.dibayar) + ')</span>' : ''}</span>`).join('')}
        </div>
      </div>`).join('')}` : '');

  // Tagihan item cards
  const tagihanSiswa = appState.tagihan.filter(t => t.nama === s.nama);
  const tagihanCards = tagihanSiswa.map(t => {
    const sisa = Math.max(0, t.nominal - t.paid_amount);
    const lunas = sisa <= 0;
    const pctPaid = pct(t.paid_amount, t.nominal);
    return `<div class="mb-8">
      <div class="fw-700 fs-13 text-primary mb-8"><svg class="ic"><use href="#i-clip"/></svg> ${esc(t.item_name)}</div>
      <div class="bg-bg rounded-12 p-14">
        <div class="flex justify-between mb-6 fs-13">
          <span>Tagihan</span><strong>${rp(t.nominal)}</strong>
        </div>
        <div class="flex justify-between mb-6 fs-13">
          <span>Dibayar</span><strong class="text-primary-light">${rp(t.paid_amount)}</strong>
        </div>
        <div class="flex justify-between mb-10 fs-13">
          <span>Sisa</span><strong class="${lunas?'text-primary-light':'text-danger'}">${lunas?'<svg class="ic"><use href="#i-check"/></svg> Lunas':rp(sisa)}</strong>
        </div>
        <div class="progress-wrap h-8">
          <div class="progress-bar ${pctPaid>=100?'green':'yellow'}" style="width:${pctPaid}%"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const totalBanner = totalT > 0
    ? `<div class="alert-danger">
        <div class="fw-800 fs-15 text-danger"><svg class="ic"><use href="#i-alert"/></svg> Total Tunggakan: ${rp(totalT)}</div>
        ${sppT > 0  ? `<div class="fs-13 mt-4">SPP: ${rp(sppT)} (${bulanBelum.length} bulan belum lunas${sppDueMonthLabel() ? ' s/d ' + sppDueMonthLabel() : ''})</div>` : ''}
        ${prevT > 0 ? `<div class="fs-13 mt-2">SPP tahun lalu: ${rp(prevT)} (${prevList.map(y => 'TA ' + esc(y.ta) + ': ' + y.unpaid.length + ' bln').join(', ')})</div>` : ''}
        ${itemT > 0 ? `<div class="fs-13 mt-2">Item lain: ${rp(itemT)}</div>` : ''}
      </div>`
    : `<div class="alert-ok">
        <div class="fw-800 fs-15 text-primary-light"><svg class="ic"><use href="#i-check"/></svg> Semua Pembayaran Lunas</div>
      </div>`;

  document.getElementById('tunggakanDetail').innerHTML = `
    <div class="card">
      ${headerBar}
      ${totalBanner}
      <div class="grid cols-3 gap-12 mb-20">
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">SPP / Bulan</div>
          <div class="fs-18 fw-800 text-primary">${rp(s.spp)}</div>
        </div>
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">Bulan Lunas</div>
          <div class="fs-18 fw-800 text-primary-light">${bulanLunas.length} <span class="fs-12 fw-500">/ 12</span></div>
        </div>
        <div class="stat-box stat-box-lg">
          <div class="hint mb-4">Item Tagihan</div>
          <div class="fs-18 fw-800 ${itemT>0?'text-danger':'text-primary-light'}">${tagihanSiswa.length}</div>
        </div>
      </div>
      <div class="mb-8 fw-700 fs-13 text-primary"><svg class="ic"><use href="#i-cal"/></svg> Status SPP per Bulan (TA berjalan)</div>
      <div class="month-grid-6-lg">${monthGrid}</div>
      <div class="fs-12 text-muted mb-20 lh-16">
        Tunggakan dihitung sampai bulan berjalan${sppDueMonthLabel() ? ' (<strong>' + esc(sppDueMonthLabel()) + '</strong>)' : ''} —
        bulan bergaris putus-putus belum jatuh tempo &amp; tidak dihitung menunggak.
      </div>
      ${prevGrids}
      ${tagihanCards}
    </div>`;
}

// Close tunggakan dropdown when clicking outside
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('tunggakanSearchWrap');
  if (wrap && !wrap.contains(e.target)) hideTunggakanDropdown();
});

function quickInput(nama) {
  showPage('input');
  setTimeout(() => {
    selectInputNama(nama);
  }, 100);
}

// ── ITEM MANAGEMENT ──
