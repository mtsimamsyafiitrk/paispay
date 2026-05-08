// ── SiPay · Dashboard Page ──
function renderDashboard() {
  const ss = appState.students;
  const totalSiswa = ss.length;
  const totalTagihanSPP = ss.reduce((a,s) => a + (s.spp||0)*12, 0);
  const totalBayarSPP = ss.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length, 0);
  const totalTagihanPangkal = ss.reduce((a,s) => a + (s.pangkal||0), 0);
  const totalBayarPangkal = ss.reduce((a,s) => a + (s.pangkal_paid||0), 0);
  const totalTunggak = ss.reduce((a,s) => a + totalTunggakan(s), 0);

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total Santri</div><div class="stat-value">${totalSiswa}</div><div class="stat-sub">Santri Aktif</div><div class="stat-icon">🎓</div></div>
    <div class="stat-card gold"><div class="stat-label">Total Terkumpul</div><div class="stat-value" style="font-size:18px;">${rp(totalBayarSPP+totalBayarPangkal)}</div><div class="stat-sub">SPP + Uang Pangkal</div><div class="stat-icon">💰</div></div>
    <div class="stat-card red"><div class="stat-label">Total Tunggakan</div><div class="stat-value" style="font-size:18px;">${rp(totalTunggak)}</div><div class="stat-sub">${ss.filter(s=>totalTunggakan(s)>0).length} santri belum lunas</div><div class="stat-icon">⚠️</div></div>
    <div class="stat-card blue"><div class="stat-label">Pangkal Lunas</div><div class="stat-value">${ss.filter(s=>s.pangkal>0&&s.pangkal_paid>=s.pangkal).length}</div><div class="stat-sub">dari ${ss.filter(s=>s.pangkal>0).length} santri</div><div class="stat-icon">✅</div></div>
  `;

  // Kelas table
  const kelasList = [...new Set(ss.map(s=>s.kelas))].sort();
  const tbody = document.querySelector('#dashKelasTable tbody');
  tbody.innerHTML = kelasList.map(k => {
    const ks = ss.filter(s=>s.kelas===k);
    const lunas = ks.filter(s=>MONTHS.every(m=>!s.spp||s.spp_paid_months.includes(m))).length;
    const tkPangkal = ks.reduce((a,s)=>a+pangkalTunggakan(s),0);
    const pct_ = pct(lunas,ks.length);
    return `<tr>
      <td><strong>${k==='?'?'Kelas Belum Diset':k}</strong></td>
      <td>${ks.length}</td>
      <td>${lunas} / ${ks.length} <span style="color:var(--text-muted);font-size:11px;">(${pct_}%)</span></td>
      <td>${rp(tkPangkal)}</td>
      <td>${pct_===100?'<span class="badge badge-green">✓ Lunas</span>':pct_>50?'<span class="badge badge-yellow">~Sebagian</span>':'<span class="badge badge-red">Banyak Tunggak</span>'}</td>
    </tr>`;
  }).join('');

  // Month summary
  const ms = document.getElementById('monthSummary');
  ms.innerHTML = MONTHS.map(m => {
    const paid = ss.filter(s=>s.spp>0&&s.spp_paid_months.includes(m)).length;
    const total = ss.filter(s=>s.spp>0).length;
    const p = pct(paid,total);
    return `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="font-weight:600;">${MONTH_FULL[m]}</span><span style="color:var(--text-muted);">${paid}/${total}</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar ${p>80?'green':p>40?'yellow':'red'}" style="width:${p}%"></div></div>
    </div>`;
  }).join('');

  // Recent transactions
  const tbody2 = document.querySelector('#recentTable tbody');
  const recent = [...appState.transactions].reverse().slice(0,10);
  if (!recent.length) {
    tbody2.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Belum ada transaksi tercatat</td></tr>';
  } else {
    tbody2.innerHTML = recent.map(t => `<tr>
      <td style="font-size:11px;color:var(--text-muted);">${t.time}</td>
      <td><strong>${t.nama}</strong></td><td>${t.kelas}</td>
      <td>${t.jenis}</td><td>${rp(t.nominal)}</td>
      <td><span class="badge badge-green">Lunas</span></td>
    </tr>`).join('');
  }
}

// ── INPUT PAGE ──
