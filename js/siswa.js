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
  wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:32px;">Memuat...</div>';

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
      wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:32px;font-size:13px;">Belum ada transaksi tercatat.</div>';
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
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
          📅 ${tgl}
        </div>
        ${txns.map(r => {
          const jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : r.time?.split(' ')[1] || '—';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:#fafafa;border:1px solid var(--border);margin-bottom:6px;">
            <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;min-width:40px;">${jam}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13px;">${esc(r.nama)} <span style="font-weight:400;color:var(--text-muted);">— ${esc(r.kelas)}</span></div>
              <div style="font-size:12px;color:#555;margin-top:2px;">${esc(r.jenis)}</div>
              ${r.catatan ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">💬 ${esc(r.catatan)}</div>` : ''}
            </div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="font-weight:700;font-size:14px;color:var(--primary-light);">Rp ${fmt(r.nominal)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`).join('');

    const pagCtrl = totalPages > 1 ? `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;font-size:13px;">
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage-1})" ${logPage<=1?'disabled':''}>← Prev</button>
        <span style="color:var(--text-muted);">Hal ${logPage} / ${totalPages} &nbsp;(${total} transaksi)</span>
        <button class="btn btn-outline btn-sm" onclick="logGoPage(${logPage+1})" ${logPage>=totalPages?'disabled':''}>Next →</button>
      </div>` : `<div style="text-align:center;font-size:11px;color:var(--text-muted);margin-top:8px;">${total} transaksi</div>`;

    wrap.innerHTML = listHtml + pagCtrl;

  } catch(e) {
    wrap.innerHTML = `<div style="color:var(--danger);padding:16px;font-size:13px;">Gagal memuat: ${e.message}</div>`;
  }
}

function logGoPage(page) {
  logPage = page;
  renderLogSiswa(false);
}

let siswaPage = 1;
const SISWA_PER_PAGE = 50;

const STATUS_KELULUSAN_BADGE = {
  lulus:  { label: 'Lulus',  cls: 'badge-green',  icon: '🎓' },
  pindah: { label: 'Pindah', cls: 'badge-yellow', icon: '🔄' },
  keluar: { label: 'Keluar', cls: 'badge-red',    icon: '🚪' },
};

function renderSiswaTable(resetPage = true) {
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
    const tagT       = appState.tagihan.filter(t => t.nama === s.nama);
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
        return `<span style="font-size:11px;padding:2px 7px;border-radius:5px;margin:1px;background:${lunas?'var(--primary-pale)':'var(--accent-pale)'};color:${lunas?'var(--primary)':'#7a5c10'};">${short}: ${lunas?'✅':'⚠️'}</span>`;
      }).join('');
    } else {
      // Lunas = hijau, menunggak (sudah jatuh tempo) = merah,
      // belum jatuh tempo = abu-abu (tidak dihitung tunggakan).
      monthBadges = MONTHS.map(m => {
        const paid = (s.spp_paid_months||[]).includes(m);
        const due  = isSppDue(m);
        const bg   = paid ? 'var(--primary)' : due ? 'var(--danger-pale)' : '#e5e0d8';
        const fg   = paid ? '#fff' : due ? 'var(--danger)' : '#999';
        const ttl  = paid ? 'Lunas' : due ? 'Belum bayar (jatuh tempo)' : 'Belum jatuh tempo';
        return `<span title="${ttl}" style="display:inline-block;width:28px;text-align:center;padding:1px 0;border-radius:4px;font-size:10px;margin:1px;background:${bg};color:${fg};">${m}</span>`;
      }).join('');
    }
    const nama_safe = escJs(s.nama);
    const no = start + i + 1;
    const sk = s.status_kelulusan || '';
    const skBadge = sk && STATUS_KELULUSAN_BADGE[sk]
      ? `<span class="badge ${STATUS_KELULUSAN_BADGE[sk].cls}" style="margin-left:4px;">${STATUS_KELULUSAN_BADGE[sk].icon} ${STATUS_KELULUSAN_BADGE[sk].label}</span>`
      : '';
    const rowStyle = sk ? 'opacity:0.65;' : '';
    return `<tr style="${rowStyle}">
      <td class="chk-col"><input type="checkbox" class="row-chk" data-nama="${esc(s.nama)}" onchange="toggleRowSelect(this)"></td>
      <td>${no}</td>
      <td><strong>${esc(s.nama)}</strong>${skBadge}</td>
      <td>${esc(kelasLabel(s))}</td>
      <td>${rp(s.spp)}</td>
      <td><div style="line-height:1.6;">${monthBadges}</div></td>
      <td>
        <div>${rp(tagPaid)} / ${rp(tagNominal)}</div>
        <div class="progress-wrap" style="margin-top:4px;"><div class="progress-bar ${pct(tagPaid,tagNominal)>=100?'green':'yellow'}" style="width:${pct(tagPaid,tagNominal)}%"></div></div>
      </td>
      <td>${tunggak>0?`<span class="badge badge-red">Tunggak ${rp(tunggak)}</span>`:'<span class="badge badge-green">✓ Lunas</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nama_safe}')" title="Detail">📋</button>
        <button class="btn btn-accent btn-sm" onclick="openEditSiswa('${nama_safe}')" title="Edit data">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSingle('${nama_safe}')" title="Hapus">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">Tidak ada data</td></tr>';

  // Pagination controls
  const existingPag = document.getElementById('siswaPagination');
  if (existingPag) existingPag.remove();
  if (totalPages > 1) {
    const pag = document.createElement('div');
    pag.id = 'siswaPagination';
    pag.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 0;font-size:13px;';
    pag.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="siswaGoPage(${siswaPage-1})" ${siswaPage<=1?'disabled':''}>← Prev</button>
      <span style="color:var(--text-muted);">Hal ${siswaPage} / ${totalPages} &nbsp;(${total} santri)</span>
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

function renderTunggakan() {
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
      <div class="stat-value" style="font-size:18px;">${rp(it.total)}</div>
      <div class="stat-sub">${it.count} santri</div>
      <div class="stat-icon">📋</div>
    </div>`).join('');

  el.innerHTML = `
    <div class="stat-card red">
      <div class="stat-label">Total Tunggakan</div>
      <div class="stat-value" style="font-size:18px;">${rp(totalTk)}</div>
      <div class="stat-sub">${withTk.length} santri belum lunas</div>
      <div class="stat-icon">⚠️</div>
    </div>
    <div class="stat-card gold">
      <div class="stat-label">Tunggakan SPP</div>
      <div class="stat-value" style="font-size:18px;">${rp(sppTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakan(s)>0).length} santri${sppDueMonthLabel() ? ' · s/d ' + esc(sppDueMonthLabel()) : ''}</div>
      <div class="stat-icon">📅</div>
    </div>
    ${sppPrevTk > 0 ? `
    <div class="stat-card red">
      <div class="stat-label">Tunggakan SPP Th. Lalu</div>
      <div class="stat-value" style="font-size:18px;">${rp(sppPrevTk)}</div>
      <div class="stat-sub">${ss.filter(s=>sppTunggakanPrev(s)>0).length} santri</div>
      <div class="stat-icon">🗓️</div>
    </div>` : ''}
    ${itemCards}
  `;
  document.getElementById('tunggakanDetail').innerHTML = '';
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
    dd.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--text-muted);">Tidak ditemukan</div>`;
    dd.style.display = 'block';
    return;
  }

  dd.innerHTML = matches.map((s, i) => {
    const tk = totalTunggakan(s);
    const badge = tk > 0
      ? `<span style="font-size:11px;font-weight:700;color:var(--danger);background:var(--danger-pale);padding:2px 8px;border-radius:20px;">Tunggak ${rp(tk)}</span>`
      : `<span style="font-size:11px;font-weight:700;color:var(--primary-light);background:var(--primary-pale);padding:2px 8px;border-radius:20px;">✓ Lunas</span>`;
    return `<div class="tk-sugg-item" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectTunggakanStudent('${escJs(s.nama)}')"
      onmouseenter="hoverTunggakanItem(${i})"
      style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;">
      <div>
        <div style="font-weight:600;font-size:13.5px;">${esc(s.nama)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${esc(kelasLabel(s))}</div>
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
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--primary);">${esc(s.nama)}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">${esc(kelasLabel(s))} &nbsp;•&nbsp; NISN: ${esc(s.nisn || '—')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="quickInput('${nameSafe}')">💳 Bayar Sekarang</button>
        <button class="btn btn-outline btn-sm" onclick="openEditPembayaran('${nameSafe}')">✏️ Edit Pembayaran</button>
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nameSafe}')">📋 Detail Lengkap</button>
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
  const monthGrid  = MONTHS.map(m => {
    const paid = (s.spp_paid_months||[]).includes(m);
    const due  = isSppDue(m);
    const border = paid ? 'var(--primary)' : due ? 'var(--danger)' : 'var(--border)';
    const bg     = paid ? 'var(--primary)' : due ? 'var(--danger-pale)' : 'var(--card)';
    const fg     = paid ? '#fff' : due ? 'var(--danger)' : 'var(--text-muted)';
    return `<div title="${paid ? 'Lunas' : due ? 'Belum bayar (sudah jatuh tempo)' : 'Belum jatuh tempo'}"
      style="padding:5px 2px;border-radius:8px;border:1.5px solid ${border};
      background:${bg};color:${fg};${paid || due ? '' : 'border-style:dashed;'}
      font-size:11px;font-weight:600;text-align:center;">${m}</div>`;
  }).join('');

  // Rincian tunggakan SPP tiap tahun ajaran sebelumnya (bulan + nominal sisa)
  const prevGrids = prevList.length ? `
    <div style="margin-bottom:8px;font-weight:700;font-size:13px;color:var(--danger);">🗓️ Tunggakan SPP Tahun Ajaran Sebelumnya</div>
    ${prevList.map(y => `
      <div style="background:var(--danger-pale);border-radius:12px;padding:12px 14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;">TA ${esc(y.ta)}${y.kelas ? ` · Kelas ${esc(y.kelas)}` : ''}</div>
          <div style="font-size:13px;font-weight:800;color:var(--danger);">${y.unpaid.length} bln · ${rp(y.amount)}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${y.detail.map(d => `<span style="font-size:11px;font-weight:600;background:#fff;border:1.5px solid var(--danger);color:var(--danger);border-radius:7px;padding:3px 8px;">
            ${MONTH_FULL[d.m]} · ${rp(d.sisa)}${d.dibayar > 0 ? ' <span style="font-weight:400;">(angsuran ' + rp(d.dibayar) + ')</span>' : ''}</span>`).join('')}
        </div>
      </div>`).join('')}` : '';

  // Tagihan item cards
  const tagihanSiswa = appState.tagihan.filter(t => t.nama === s.nama);
  const tagihanCards = tagihanSiswa.map(t => {
    const sisa = Math.max(0, t.nominal - t.paid_amount);
    const lunas = sisa <= 0;
    const pctPaid = pct(t.paid_amount, t.nominal);
    return `<div style="margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:8px;">📋 ${esc(t.item_name)}</div>
      <div style="background:var(--bg);border-radius:12px;padding:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
          <span>Tagihan</span><strong>${rp(t.nominal)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
          <span>Dibayar</span><strong style="color:var(--primary-light);">${rp(t.paid_amount)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px;">
          <span>Sisa</span><strong style="color:${lunas?'var(--primary-light)':'var(--danger)'};">${lunas?'✅ Lunas':rp(sisa)}</strong>
        </div>
        <div class="progress-wrap" style="height:8px;">
          <div class="progress-bar ${pctPaid>=100?'green':'yellow'}" style="width:${pctPaid}%"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const totalBanner = totalT > 0
    ? `<div style="background:var(--danger-pale);border-left:4px solid var(--danger);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-weight:800;font-size:15px;color:var(--danger);">⚠️ Total Tunggakan: ${rp(totalT)}</div>
        ${sppT > 0  ? `<div style="font-size:13px;margin-top:4px;">SPP: ${rp(sppT)} (${bulanBelum.length} bulan belum lunas${sppDueMonthLabel() ? ' s/d ' + sppDueMonthLabel() : ''})</div>` : ''}
        ${prevT > 0 ? `<div style="font-size:13px;margin-top:2px;">SPP tahun lalu: ${rp(prevT)} (${prevList.map(y => 'TA ' + esc(y.ta) + ': ' + y.unpaid.length + ' bln').join(', ')})</div>` : ''}
        ${itemT > 0 ? `<div style="font-size:13px;margin-top:2px;">Item lain: ${rp(itemT)}</div>` : ''}
      </div>`
    : `<div style="background:var(--primary-pale);border-left:4px solid var(--primary-light);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-weight:800;font-size:15px;color:var(--primary-light);">✅ Semua Pembayaran Lunas</div>
      </div>`;

  document.getElementById('tunggakanDetail').innerHTML = `
    <div class="card">
      ${headerBar}
      ${totalBanner}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--bg);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">SPP / Bulan</div>
          <div style="font-size:18px;font-weight:800;color:var(--primary);">${rp(s.spp)}</div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Bulan Lunas</div>
          <div style="font-size:18px;font-weight:800;color:var(--primary-light);">${bulanLunas.length} <span style="font-size:12px;font-weight:500;">/ 12</span></div>
        </div>
        <div style="background:var(--bg);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Item Tagihan</div>
          <div style="font-size:18px;font-weight:800;color:${itemT>0?'var(--danger)':'var(--primary-light)'};">${tagihanSiswa.length}</div>
        </div>
      </div>
      <div style="margin-bottom:8px;font-weight:700;font-size:13px;color:var(--primary);">📅 Status SPP per Bulan (TA berjalan)</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px;">${monthGrid}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:20px;line-height:1.6;">
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
