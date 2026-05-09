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
              <div style="font-weight:700;font-size:13px;">${r.nama} <span style="font-weight:400;color:var(--text-muted);">— ${r.kelas}</span></div>
              <div style="font-size:12px;color:#555;margin-top:2px;">${r.jenis}</div>
              ${r.catatan ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">💬 ${r.catatan}</div>` : ''}
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

function renderSiswaTable(resetPage = true) {
  if (resetPage) siswaPage = 1;
  const q = document.getElementById('searchSiswa').value.toLowerCase();
  const sFilter = document.getElementById('filterStatus').value;
  let list = appState.students.filter(s => {
    if (q && !s.nama.toLowerCase().includes(q) && !s.nisn?.includes(q)) return false;
    if (activeKelasFilter && s.kelas !== activeKelasFilter) return false;
    if (sFilter === 'lunas' && totalTunggakan(s) > 0) return false;
    if (sFilter === 'tunggak' && totalTunggakan(s) === 0) return false;
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
    const history = s.spp_history || {};
    const taKeys  = Object.keys(history).sort((a,b) => parseInt(a.split('/')[0]) - parseInt(b.split('/')[0]));
    let monthBadges;
    if (taKeys.length > 1) {
      monthBadges = taKeys.map(ta => {
        const d = history[ta];
        const lunas = !d.spp || MONTHS.every(m => (d.spp_paid_months||[]).includes(m));
        const short = ta.replace(/20(\d\d)\/20(\d\d)/, '$1/$2');
        return `<span style="font-size:11px;padding:2px 7px;border-radius:5px;margin:1px;background:${lunas?'var(--primary-pale)':'var(--accent-pale)'};color:${lunas?'var(--primary)':'#7a5c10'};">${short}: ${lunas?'✅':'⚠️'}</span>`;
      }).join('');
    } else {
      monthBadges = MONTHS.map(m=>`<span style="display:inline-block;width:28px;text-align:center;padding:1px 0;border-radius:4px;font-size:10px;margin:1px;background:${(s.spp_paid_months||[]).includes(m)?'var(--primary)':'#e5e0d8'};color:${(s.spp_paid_months||[]).includes(m)?'#fff':'#999'};">${m}</span>`).join('');
    }
    const nama_safe = s.nama.replace(/'/g, "\'");
    const no = start + i + 1;
    return `<tr>
      <td class="chk-col"><input type="checkbox" class="row-chk" data-nama="${s.nama}" onchange="toggleRowSelect(this)"></td>
      <td>${no}</td>
      <td><strong>${s.nama}</strong></td>
      <td>${s.kelas}</td>
      <td>${rp(s.spp)}</td>
      <td><div style="line-height:1.6;">${monthBadges}</div></td>
      <td>
        <div>${rp(s.pangkal_paid)} / ${rp(s.pangkal)}</div>
        <div class="progress-wrap" style="margin-top:4px;"><div class="progress-bar ${pct(s.pangkal_paid,s.pangkal)>=100?'green':'yellow'}" style="width:${pct(s.pangkal_paid,s.pangkal)}%"></div></div>
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
  const totalTk   = withTk.reduce((a,s) => a + totalTunggakan(s), 0);
  const sppTk     = withTk.reduce((a,s) => a + sppTunggakan(s), 0);
  const pangkalTk = withTk.reduce((a,s) => a + pangkalTunggakan(s), 0);
  const crossTk   = withTk.reduce((a,s) => a + crossTATunggakan(s), 0);

  const el = document.getElementById('tunggakanStats');
  if (!el) return;
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
      <div class="stat-sub">${withTk.filter(s=>sppTunggakan(s)>0).length} santri</div>
      <div class="stat-icon">📅</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Tunggakan Pangkal</div>
      <div class="stat-value" style="font-size:18px;">${rp(pangkalTk)}</div>
      <div class="stat-sub">${withTk.filter(s=>pangkalTunggakan(s)>0).length} santri</div>
      <div class="stat-icon">🏫</div>
    </div>
    ${crossTk > 0 ? `
    <div class="stat-card red">
      <div class="stat-label">Lintas TA</div>
      <div class="stat-value" style="font-size:18px;">${rp(crossTk)}</div>
      <div class="stat-sub">${ss.filter(s=>crossTATunggakan(s)>0).length} santri</div>
      <div class="stat-icon">📂</div>
    </div>` : ''}
  `;
  // Reset detail & search
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
    return `<div class="tk-sugg-item" data-idx="${i}" data-nama="${s.nama.replace(/"/g,'&quot;')}"
      onmousedown="selectTunggakanStudent('${s.nama.replace(/'/g,"\\'")}')"
      onmouseenter="hoverTunggakanItem(${i})"
      style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;">
      <div>
        <div style="font-weight:600;font-size:13.5px;">${s.nama}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${s.kelas}</div>
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
  const nameSafe  = s.nama.replace(/'/g, "\\'");
  const headerBar = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--primary);">${s.nama}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">${s.kelas} &nbsp;•&nbsp; NISN: ${s.nisn || '—'}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="quickInput('${nameSafe}')">💳 Bayar Sekarang</button>
        <button class="btn btn-outline btn-sm" onclick="openEditPembayaran('${nameSafe}')">✏️ Edit Pembayaran</button>
        <button class="btn btn-outline btn-sm" onclick="showDetail('${nameSafe}')">📋 Detail Lengkap</button>
      </div>
    </div>`;

  const history = s.spp_history || {};
  const taKeys  = Object.keys(history).sort((a,b) => parseInt(a.split('/')[0]) - parseInt(b.split('/')[0]));

  // ── Tampilan multi-TA (spp_history ada isinya) ──
  if (taKeys.length > 0) {
    const totalT = sppTunggakan(s) + pangkalTunggakan(s);

    const taCards = taKeys.map(ta => {
      const d         = history[ta];
      const sppTA     = d.spp ? MONTHS.filter(m => !(d.spp_paid_months||[]).includes(m)).length * d.spp : 0;
      const pangkalTA = Math.max(0, (d.pangkal||0) - (d.pangkal_paid||0));
      const tunggakTA = sppTA + pangkalTA;
      const lunas     = tunggakTA === 0;
      const bulanBelum = d.spp ? MONTHS.filter(m => !(d.spp_paid_months||[]).includes(m)) : [];
      const monthGrid = MONTHS.map(m => {
        const paid = (d.spp_paid_months||[]).includes(m);
        return `<div style="padding:4px 2px;border-radius:6px;border:1.5px solid ${paid?'var(--primary)':'var(--border)'};
          background:${paid?'var(--primary)':'var(--card)'};color:${paid?'#fff':'var(--text-muted)'};
          font-size:10px;font-weight:600;text-align:center;">${m}</div>`;
      }).join('');

      return `<div style="border:1.5px solid ${lunas?'var(--primary-light)':'var(--danger)'};border-radius:12px;padding:16px;margin-bottom:12px;background:${lunas?'var(--primary-pale)':'var(--danger-pale)'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-weight:800;font-size:14px;color:${lunas?'var(--primary)':'var(--danger)'};">TA ${ta} — Kelas ${d.kelas||'?'} ${lunas?'✅':'⚠️'}</div>
          <div style="font-size:12px;font-weight:700;color:${lunas?'var(--primary-light)':'var(--danger)'};">${lunas?'Lunas':'Tunggak '+rp(tunggakTA)}</div>
        </div>
        ${d.spp ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">SPP: ${rp(d.spp)}/bln</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:6px;">${monthGrid}</div>
        <div style="font-size:11px;margin-bottom:4px;">
          <span style="font-weight:600;">${(d.spp_paid_months||[]).length}/12 bulan lunas</span>
          ${bulanBelum.length ? ` &nbsp;• Belum: <span style="color:var(--danger);">${bulanBelum.join(', ')}</span>` : ''}
        </div>` : ''}
        ${d.pangkal ? `<div style="font-size:12px;margin-top:6px;">
          Pangkal: ${rp(d.pangkal_paid)} / ${rp(d.pangkal)}
          ${pangkalTA <= 0
            ? '<span style="color:var(--primary-light);font-weight:600;"> ✅ Lunas</span>'
            : `<span style="color:var(--danger);font-weight:600;"> Sisa ${rp(pangkalTA)}</span>`}
        </div>` : ''}
      </div>`;
    }).join('');

    const totalBanner = `<div style="background:${totalT>0?'var(--danger-pale)':'var(--primary-pale)'};border-left:4px solid ${totalT>0?'var(--danger)':'var(--primary-light)'};border-radius:10px;padding:14px 16px;margin-top:4px;">
      <div style="font-weight:800;font-size:15px;color:${totalT>0?'var(--danger)':'var(--primary-light)'};">
        ${totalT>0 ? '⚠️ TOTAL TUNGGAKAN: '+rp(totalT) : '✅ Semua Pembayaran Lunas'}
      </div>
    </div>`;

    document.getElementById('tunggakanDetail').innerHTML =
      `<div class="card">${headerBar}${taCards}${totalBanner}</div>`;
    return;
  }

  // ── Tampilan fallback (siswa lama tanpa spp_history) ──
  const sppT     = sppTunggakan(s);
  const pangkalT = pangkalTunggakan(s);
  const totalT   = sppT + pangkalT;
  const bulanBelum = MONTHS.filter(m => !(s.spp_paid_months||[]).includes(m) && s.spp > 0);
  const bulanLunas = MONTHS.filter(m => (s.spp_paid_months||[]).includes(m));

  const monthGrid = MONTHS.map(m => {
    const paid = (s.spp_paid_months||[]).includes(m);
    return `<div style="padding:5px 2px;border-radius:8px;border:1.5px solid ${paid?'var(--primary)':'var(--border)'};
      background:${paid?'var(--primary)':'var(--card)'};color:${paid?'#fff':'var(--text-muted)'};
      font-size:11px;font-weight:600;text-align:center;">${m}</div>`;
  }).join('');

  const statusBanner = totalT > 0
    ? `<div style="background:var(--danger-pale);border-left:4px solid var(--danger);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-weight:800;font-size:15px;color:var(--danger);">⚠️ Total Tunggakan: ${rp(totalT)}</div>
        ${sppT > 0     ? `<div style="font-size:13px;color:var(--text);margin-top:4px;">SPP: ${rp(sppT)} (${bulanBelum.length} bulan)</div>` : ''}
        ${pangkalT > 0 ? `<div style="font-size:13px;color:var(--text);margin-top:2px;">Pangkal: ${rp(pangkalT)}</div>` : ''}
      </div>`
    : `<div style="background:var(--primary-pale);border-left:4px solid var(--primary-light);border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-weight:800;font-size:15px;color:var(--primary-light);">✅ Semua Pembayaran Lunas</div>
      </div>`;

  document.getElementById('tunggakanDetail').innerHTML = `
    <div class="card">
      ${headerBar}
      ${statusBanner}
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
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Pangkal Dibayar</div>
          <div style="font-size:18px;font-weight:800;color:${pangkalT>0?'var(--danger)':'var(--primary-light)'};">${pct(s.pangkal_paid,s.pangkal)}%</div>
        </div>
      </div>
      <div style="margin-bottom:8px;font-weight:700;font-size:13px;color:var(--primary);">📅 Status SPP per Bulan</div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:20px;">${monthGrid}</div>
      ${s.pangkal > 0 ? `
      <div style="margin-bottom:8px;font-weight:700;font-size:13px;color:var(--primary);">🏫 Uang Pangkal</div>
      <div style="background:var(--bg);border-radius:12px;padding:14px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;">
          <span>Sudah dibayar</span><strong>${rp(s.pangkal_paid)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;">
          <span>Total tagihan</span><strong>${rp(s.pangkal)}</strong>
        </div>
        <div class="progress-wrap" style="height:10px;">
          <div class="progress-bar ${pct(s.pangkal_paid,s.pangkal)>=100?'green':'yellow'}" style="width:${pct(s.pangkal_paid,s.pangkal)}%"></div>
        </div>
      </div>` : ''}
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
