// ── SiPay · Dashboard Page ──
function renderDashboard() {
  const all = appState.students;
  // ss = santri AKTIF. Tabel students juga menyimpan alumni, santri pindah/
  // keluar, dan calon santri SPMB — semuanya TIDAK boleh ikut dihitung sebagai
  // "Santri Aktif" atau tunggakan berjalan.
  const ss = all.filter(isSantriAktif);
  const nonAktif = all.length - ss.length;
  const rincianNonAktif = Object.entries(STATUS_NON_AKTIF)
    .map(([k, label]) => ({ label, n: all.filter(s => (s.status_kelulusan || '') === k).length }))
    .filter(x => x.n);

  // Uang yang benar-benar masuk — dihitung dari SEMUA santri, termasuk yang
  // sudah tidak aktif, karena pembayaran mereka tetap pemasukan yang nyata.
  const totalBayarSPP = all.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length, 0);
  const totalBayarTagihan = appState.tagihan.reduce((a,t) => a + (t.paid_amount||0), 0);

  // Tunggakan berjalan = santri aktif saja. Tunggakan santri non-aktif tetap
  // ditampilkan terpisah supaya tidak hilang dari pandangan.
  const totalTunggak = ss.reduce((a,s) => a + totalTunggakan(s), 0);
  const belumLunas   = ss.filter(s => totalTunggakan(s) > 0).length;
  const tunggakNonAktif = all.filter(s => !isSantriAktif(s)).reduce((a,s) => a + totalTunggakan(s), 0);

  const subSantri = nonAktif
    ? `Santri Aktif &nbsp;·&nbsp; +${nonAktif} non-aktif`
    : 'Santri Aktif';
  const judulSantri = nonAktif
    ? `${all.length} baris di database: ${ss.length} aktif, ` +
      rincianNonAktif.map(x => `${x.n} ${x.label}`).join(', ')
    : `${all.length} santri aktif`;

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card green" title="${esc(judulSantri)}"><div class="stat-label">Total Santri</div><div class="stat-value">${ss.length}</div><div class="stat-sub">${subSantri}</div><div class="stat-icon">🎓</div></div>
    <div class="stat-card gold"><div class="stat-label">Total Terkumpul</div><div class="stat-value" style="font-size:18px;">${rp(totalBayarSPP+totalBayarTagihan)}</div><div class="stat-sub">SPP + Semua Pembayaran</div><div class="stat-icon">💰</div></div>
    <div class="stat-card red"><div class="stat-label">Total Tunggakan</div><div class="stat-value" style="font-size:18px;">${rp(totalTunggak)}</div><div class="stat-sub">${belumLunas} dari ${ss.length} santri aktif belum lunas${tunggakNonAktif > 0 ? ` &nbsp;·&nbsp; ${rp(tunggakNonAktif)} non-aktif` : ''}</div><div class="stat-icon">⚠️</div></div>
    <div class="stat-card blue"><div class="stat-label">Tagihan Aktif</div><div class="stat-value">${appState.tagihan.filter(t=>t.paid_amount>=t.nominal).length}</div><div class="stat-sub">dari ${appState.tagihan.length} total tagihan</div><div class="stat-icon">✅</div></div>
  `;

  // Kelas table
  const kelasList = [...new Set(ss.map(s=>s.kelas))].sort();
  const tbody = document.querySelector('#dashKelasTable tbody');
  tbody.innerHTML = kelasList.map(k => {
    const ks = ss.filter(s=>s.kelas===k);
    // "Lunas" = tidak ada tunggakan s/d bulan berjalan (bulan yang belum tiba
    // tidak membuat santri dianggap menunggak).
    const lunas = ks.filter(s => !s.spp || sppUnpaidDueMonths(s).length === 0).length;
    const tkItems = ks.reduce((a,s)=>a+itemsTunggakan(s),0);
    const pct_ = pct(lunas,ks.length);
    return `<tr>
      <td><strong>${k==='?'?'Kelas Belum Diset':esc(k)}</strong></td>
      <td>${ks.length}</td>
      <td>${lunas} / ${ks.length} <span style="color:var(--text-muted);font-size:11px;">(${pct_}%)</span></td>
      <td>${rp(tkItems)}</td>
      <td>${pct_===100?'<span class="badge badge-green">✓ Lunas</span>':pct_>50?'<span class="badge badge-yellow">~Sebagian</span>':'<span class="badge badge-red">Banyak Tunggak</span>'}</td>
    </tr>`;
  }).join('');

  // Month summary
  const ms = document.getElementById('monthSummary');
  ms.innerHTML = MONTHS.map(m => {
    const paid = ss.filter(s=>s.spp>0&&s.spp_paid_months.includes(m)).length;
    const total = ss.filter(s=>s.spp>0).length;
    const p = pct(paid,total);
    // Bulan yang belum jatuh tempo ditandai netral — capaian rendah di situ
    // wajar (belum ditagih), jadi jangan diberi warna "merah".
    const due = isSppDue(m);
    return `<div style="margin-bottom:10px;${due?'':'opacity:.6;'}">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="font-weight:600;">${MONTH_FULL[m]}${due?'':' <span style="font-weight:400;font-size:10px;color:var(--text-muted);">(belum jatuh tempo)</span>'}</span><span style="color:var(--text-muted);">${paid}/${total}</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar ${!due?'yellow':p>80?'green':p>40?'yellow':'red'}" style="width:${p}%"></div></div>
    </div>`;
  }).join('');

  // Recent transactions
  const tbody2 = document.querySelector('#recentTable tbody');
  const recent = [...appState.transactions].reverse().slice(0,10);
  if (!recent.length) {
    tbody2.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Belum ada transaksi tercatat</td></tr>';
  } else {
    tbody2.innerHTML = recent.map(t => `<tr>
      <td style="font-size:11px;color:var(--text-muted);">${esc(t.time)}</td>
      <td><strong>${esc(t.nama)}</strong></td><td>${esc(t.kelas)}</td>
      <td>${esc(t.jenis)}</td><td>${rp(t.nominal)}</td>
      <td><span class="badge badge-green">Lunas</span></td>
    </tr>`).join('');
  }
}

// ── INPUT PAGE ──
