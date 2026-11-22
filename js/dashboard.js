// ── SiPay · Dashboard Page ──
function renderDashboard() {
  return withTagihanIndex(_renderDashboard);
}
function _renderDashboard() {
  const all = appState.students;
  // ss = santri AKTIF. Tabel students juga menyimpan alumni, santri pindah/
  // keluar, dan calon santri SPMB — semuanya TIDAK boleh ikut dihitung sebagai
  // "Santri Aktif" atau tunggakan berjalan.
  const ss = all.filter(isSantriAktif);
  const nonAktif = all.length - ss.length;
  // Satu lintasan untuk seluruh rincian status (dulu satu filter penuh per status).
  const jmlStatus = {};
  all.forEach(s => { const k = s.status_kelulusan || ''; jmlStatus[k] = (jmlStatus[k] || 0) + 1; });
  const rincianNonAktif = Object.entries(STATUS_NON_AKTIF)
    .map(([k, label]) => ({ label, n: jmlStatus[k] || 0 }))
    .filter(x => x.n);

  // Uang yang benar-benar masuk — dihitung dari SEMUA santri, termasuk yang
  // sudah tidak aktif, karena pembayaran mereka tetap pemasukan yang nyata.
  const totalBayarSPP = all.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length + sppAngsurTotal(s, MONTHS), 0);
  const totalBayarTagihan = appState.tagihan.reduce((a,t) => a + (t.paid_amount||0), 0);

  // Tunggakan berjalan = santri aktif saja. Tunggakan santri non-aktif tetap
  // ditampilkan terpisah supaya tidak hilang dari pandangan.
  const totalTunggak = ss.reduce((a,s) => a + totalTunggakan(s), 0);
  const belumLunas   = ss.filter(s => totalTunggakan(s) > 0).length;
  const tunggakNonAktif = all.reduce((a,s) => isSantriAktif(s) ? a : a + totalTunggakan(s), 0);

  const subSantri = nonAktif
    ? `Santri Aktif &nbsp;·&nbsp; +${nonAktif} non-aktif`
    : 'Santri Aktif';
  const judulSantri = nonAktif
    ? `${all.length} baris di database: ${ss.length} aktif, ` +
      rincianNonAktif.map(x => `${x.n} ${x.label}`).join(', ')
    : `${all.length} santri aktif`;

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card green" title="${esc(judulSantri)}"><div class="stat-label">Total Santri</div><div class="stat-value">${ss.length}</div><div class="stat-sub">${subSantri}</div><div class="stat-icon"><svg class="ic"><use href="#i-grad"/></svg></div></div>
    <div class="stat-card gold"><div class="stat-label">Total Terkumpul</div><div class="stat-value fs-18">${rp(totalBayarSPP+totalBayarTagihan)}</div><div class="stat-sub">SPP + Semua Pembayaran</div><div class="stat-icon"><svg class="ic"><use href="#i-cash"/></svg></div></div>
    <div class="stat-card red"><div class="stat-label">Total Tunggakan</div><div class="stat-value fs-18">${rp(totalTunggak)}</div><div class="stat-sub">${belumLunas} dari ${ss.length} santri aktif belum lunas${tunggakNonAktif > 0 ? ` &nbsp;·&nbsp; ${rp(tunggakNonAktif)} non-aktif` : ''}</div><div class="stat-icon"><svg class="ic"><use href="#i-alert"/></svg></div></div>
    <div class="stat-card blue"><div class="stat-label">Santri Lunas</div><div class="stat-value">${ss.length - belumLunas}</div><div class="stat-sub">dari ${ss.length} santri aktif tanpa tunggakan</div><div class="stat-icon"><svg class="ic"><use href="#i-check"/></svg></div></div>
  `;

  // Kelas table
  // Kelompokkan sekali (dulu: satu penyaringan penuh untuk tiap kelas).
  const perKelas = new Map();
  ss.forEach(s => {
    const arr = perKelas.get(s.kelas);
    if (arr) arr.push(s); else perKelas.set(s.kelas, [s]);
  });
  const kelasList = [...perKelas.keys()].sort();
  const tbody = document.querySelector('#dashKelasTable tbody');
  tbody.innerHTML = kelasList.map(k => {
    const ks = perKelas.get(k);
    // "Lunas" = tidak ada tunggakan s/d bulan berjalan (bulan yang belum tiba
    // tidak membuat santri dianggap menunggak).
    const lunas = ks.filter(s => !s.spp || sppUnpaidDueMonths(s).length === 0).length;
    const tkItems = ks.reduce((a,s)=>a+itemsTunggakan(s),0);
    const pct_ = pct(lunas,ks.length);
    return `<tr>
      <td><strong>${k==='?'?'Kelas Belum Diset':esc(k)}</strong></td>
      <td>${ks.length}</td>
      <td>${lunas} / ${ks.length} <span class="hint">(${pct_}%)</span></td>
      <td>${rp(tkItems)}</td>
      <td>${pct_===100?'<span class="badge badge-green">✓ Lunas</span>':pct_>50?'<span class="badge badge-yellow">~Sebagian</span>':'<span class="badge badge-red">Banyak Tunggak</span>'}</td>
    </tr>`;
  }).join('');

  // Month summary
  const ms = document.getElementById('monthSummary');
  // Santri yang baru masuk di tengah TA belum ditagih bulan-bulan sebelumnya,
  // jadi ia tidak ikut jadi penyebut di bulan-bulan itu. Dihitung dalam satu
  // lintasan santri — dulu tiap bulan menyaring ulang seluruh daftar (2x12 kali).
  const rekapBulan = MONTHS.map(() => ({ ditagih: 0, paid: 0 }));
  ss.forEach(s => {
    if (!(s.spp > 0)) return;
    const paidMonths = s.spp_paid_months || [];
    for (let i = sppMulaiIndex(s); i < MONTHS.length; i++) {
      rekapBulan[i].ditagih++;
      if (paidMonths.includes(MONTHS[i])) rekapBulan[i].paid++;
    }
  });
  ms.innerHTML = MONTHS.map((m, mi) => {
    const paid  = rekapBulan[mi].paid;
    const total = rekapBulan[mi].ditagih;
    const p = pct(paid,total);
    // Bulan yang belum jatuh tempo ditandai netral — capaian rendah di situ
    // wajar (belum ditagih), jadi jangan diberi warna "merah".
    const due = isSppDue(m);
    return `<div style="margin-bottom:10px;${due?'':'opacity:.6;'}">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span class="fw-600">${MONTH_FULL[m]}${due?'':' <span style="font-weight:400;font-size:12px;color:var(--text-muted);">(belum jatuh tempo)</span>'}</span><span class="text-muted">${paid}/${total}</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar ${!due?'yellow':p>80?'green':p>40?'yellow':'red'}" style="width:${p}%"></div></div>
    </div>`;
  }).join('');

  // Tunggakan terbesar — santri aktif, 5 teratas, langsung bisa dibayar
  const top = ss.map(s => ({ s, tk: totalTunggakan(s) })).filter(x => x.tk > 0)
    .sort((a, b) => b.tk - a.tk).slice(0, 5);
  document.querySelector('#dashTopTunggak tbody').innerHTML = top.length
    ? top.map(({ s, tk }) => `<tr>
        <td><strong>${esc(s.nama)}</strong></td><td>${esc(kelasLabel(s))}</td>
        <td style="text-align:right;color:var(--danger);font-weight:700;">${rp(tk)}</td>
        <td class="text-right"><button class="btn btn-primary btn-sm" onclick="quickInput('${escJs(s.nama)}')"><svg class="ic"><use href="#i-card"/></svg> Bayar</button></td>
      </tr>`).join('')
    : '<tr><td class="empty-row" colspan="4"><svg class="ic"><use href="#i-check"/></svg> Tidak ada tunggakan</td></tr>';

  // Recent transactions
  const tbody2 = document.querySelector('#recentTable tbody');
  const recent = appState.transactions.slice(-6).reverse();
  if (!recent.length) {
    tbody2.innerHTML = '<tr><td class="empty-row" colspan="4">Belum ada transaksi tercatat</td></tr>';
  } else {
    tbody2.innerHTML = recent.map(t => `<tr>
      <td class="hint">${esc(t.time)}</td>
      <td><strong>${esc(t.nama)}</strong></td>
      <td>${esc(t.jenis)}</td><td class="text-right">${rp(t.nominal)}</td>
    </tr>`).join('');
  }
}

// ── INPUT PAGE ──
