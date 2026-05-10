// ── SiPay · Input Pembayaran ──
let inputNamaSuggIdx = -1;

function renderInputPage() {
  // Reset search field saat halaman dibuka
  const searchEl = document.getElementById('inputNamaSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('inputNama').value = '';
  const chk = document.getElementById('inputShowNonAktif');
  if (chk) chk.checked = false;
  hideInputNamaDropdown();
  renderPaymentItems();
}

function onInputNamaSearch() {
  inputNamaSuggIdx = -1;
  const q = (document.getElementById('inputNamaSearch').value || '').toLowerCase().trim();
  const dd = document.getElementById('inputNamaDropdown');
  if (!dd) return;

  // Default: hanya santri aktif; centang toggle untuk tampilkan non-aktif
  const showNonAktif = document.getElementById('inputShowNonAktif')?.checked;
  const base = showNonAktif
    ? appState.students
    : appState.students.filter(s => !s.status_kelulusan);

  const list = q
    ? base.filter(s =>
        s.nama.toLowerCase().includes(q) ||
        (s.nisn && s.nisn.includes(q)) ||
        s.kelas.includes(q)
      )
    : base;

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

  // Highlight karakter yang cocok
  const highlight = (text, q) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return text.slice(0, idx) +
      `<mark style="background:#fef08a;border-radius:2px;padding:0 1px;">${text.slice(idx, idx+q.length)}</mark>` +
      text.slice(idx + q.length);
  };

  dd.innerHTML = list.slice(0, 15).map((s, i) => `
    <div class="input-nama-item" data-idx="${i}" data-nama="${s.nama.replace(/"/g,'&quot;')}"
      onmousedown="selectInputNama('${s.nama.replace(/'/g,"\\'")}')"
      onmouseenter="hoverInputNamaItem(${i})"
      style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;">
      <div>
        <div style="font-weight:600;font-size:13.5px;">${highlight(s.nama, q)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas}${s.nisn ? ' · NISN ' + s.nisn : ''}</div>
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

// Tutup dropdown saat klik di luar
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('inputNamaSearch')?.closest('div');
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
  const tunggakSPP = sppTunggakan(s);
  const tunggakPangkal = pangkalTunggakan(s);
  document.getElementById('studentSummary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div style="font-size:12px;color:var(--text-muted);">SPP/bulan</div><div style="font-size:12px;font-weight:600;">${rp(s.spp)}</div>
      <div style="font-size:12px;color:var(--text-muted);">Bulan dibayar</div><div style="font-size:12px;font-weight:600;">${(s.spp_paid_months||[]).length} bulan</div>
      <div style="font-size:12px;color:var(--text-muted);">Tunggakan SPP</div><div style="font-size:12px;font-weight:600;color:${tunggakSPP>0?'var(--danger)':'var(--primary-light)'};">${rp(tunggakSPP)}</div>
      <div style="font-size:12px;color:var(--text-muted);">Pangkal tersisa</div><div style="font-size:12px;font-weight:600;color:${tunggakPangkal>0?'var(--danger)':'var(--primary-light)'};">${rp(tunggakPangkal)}</div>
    </div>
  `;
  renderPaymentItems(s);
}

function renderPaymentItems(student) {
  const cont = document.getElementById('paymentItems');
  const activeItems = appState.payItems.filter(i => {
    if (!i.active) return false;
    // Jika tidak ada kelas tersetting, item tidak muncul
    if (!i.kelas || !i.kelas.length) return false;
    // Jika ada siswa dipilih, filter sesuai kelasnya
    if (student) return i.kelas.includes(String(student.kelas));
    // Jika belum pilih siswa, tampilkan semua item aktif
    return true;
  });
  if (!activeItems.length) {
    cont.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Tidak ada item aktif. Aktifkan di menu "Kelola Item Bayar"</div>';
    return;
  }

  // ── Item bayar utama (TA aktif) ──
  let html = activeItems.map(item => {
    let amount = item.amount;
    if (item.type === 'bulanan' && student) amount = student.spp || item.amount || 0;
    if (item.id === 'pangkal' && student) amount = pangkalTunggakan(student);
    let extra = '';

    // Keterangan rincian pangkal
    if (item.id === 'pangkal' && student && student.pangkal > 0) {
      const sisa = pangkalTunggakan(student);
      const totalPaid = student.pangkal_paid || 0;
      const nominalPangkal = student.pangkal || 0;
      if (sisa <= 0) {
        extra = `<div style="margin-top:6px;font-size:12px;color:var(--primary-light);font-weight:600;">✅ Pangkal sudah lunas (${rp(nominalPangkal)})</div>`;
      } else {
        extra = `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
          Total pangkal: <strong>${rp(nominalPangkal)}</strong> &nbsp;|&nbsp;
          Sudah dibayar: <strong style="color:var(--primary-light);">${rp(totalPaid)}</strong> &nbsp;|&nbsp;
          <strong style="color:var(--danger);">Sisa: ${rp(sisa)}</strong>
        </div>`;
      }
    }
    if (item.type === 'bulanan' && student && amount > 0) {
      const unpaid = MONTHS.filter(m => !student.spp_paid_months.includes(m));
      if (unpaid.length === 0) {
        extra = `<div style="margin-top:6px;font-size:12px;color:var(--primary-light);font-weight:600;">✅ Semua bulan sudah lunas</div>`;
      } else {
        extra = `<div style="margin-top:8px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Pilih bulan (bisa lebih dari 1):</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;" id="sppMonthWrap">
            ${unpaid.map(m=>`
              <label style="display:flex;align-items:center;gap:4px;padding:4px 9px;border:1.5px solid var(--border);border-radius:7px;cursor:pointer;font-size:12px;font-weight:500;transition:.15s;"
                id="sppMonthLabel_${m}" onclick="toggleSppMonth('${m}',this)">
                <input type="checkbox" id="sppChk_${m}" value="${m}" style="display:none;">
                ${MONTH_FULL[m]}
              </label>`).join('')}
          </div>
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted);" id="sppMonthInfo">Belum ada bulan dipilih</div>
        </div>`;
      }
    }
    if (item.type === 'custom') {
      extra = `<div class="pay-item-custom" style="margin-top:6px;"><input type="number" id="custom_${item.id}" placeholder="Nominal..." value="${amount||''}" oninput="calcTotal()" style="font-size:12px;padding:4px 8px;width:150px;"></div>`;
    }
    return `<div class="pay-item" ${item.id==='pangkal' && student && pangkalTunggakan(student)<=0 ? 'style="opacity:.5;pointer-events:none;"' : ''}>
      <input type="checkbox" id="chk_${item.id}" onchange="calcTotal()" ${item.id==='pangkal' && student && pangkalTunggakan(student)<=0 ? 'disabled' : ''}>
      <div class="pay-item-info">
        <div class="pay-item-name">${item.name}</div>
        <div class="pay-item-amount">${
          item.id === 'pangkal' && student
            ? (pangkalTunggakan(student) > 0 ? rp(pangkalTunggakan(student)) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted);">(sisa)</span>' : '✅ Lunas')
            : item.type==='custom' ? 'Nominal custom' : rp(amount)
        }</div>
        ${extra}
      </div>
    </div>`;
  }).join('');


  cont.innerHTML = html;
  calcTotal();
}

function toggleSppMonth(m, labelEl) {
  const chk = document.getElementById('sppChk_' + m);
  if (!chk) return;
  chk.checked = !chk.checked;
  // Update style label
  if (chk.checked) {
    labelEl.style.background = 'var(--primary)';
    labelEl.style.color = '#fff';
    labelEl.style.borderColor = 'var(--primary)';
  } else {
    labelEl.style.background = '';
    labelEl.style.color = '';
    labelEl.style.borderColor = '';
  }
  // Update info teks & total
  const selected = getSppMonthsSelected();
  const info = document.getElementById('sppMonthInfo');
  if (info) {
    info.textContent = selected.length
      ? selected.length + ' bulan dipilih: ' + selected.map(m => MONTH_FULL[m]).join(', ')
      : 'Belum ada bulan dipilih';
    info.style.color = selected.length ? 'var(--primary-light)' : 'var(--text-muted)';
  }
  calcTotal();
}

function getSppMonthsSelected() {
  return MONTHS.filter(m => document.getElementById('sppChk_' + m)?.checked);
}

function calcTotal() {
  let total = 0;
  const student = getStudent(document.getElementById('inputNama').value);
  appState.payItems.filter(i=>i.active).forEach(item => {
    const chk = document.getElementById('chk_'+item.id);
    if (!chk || !chk.checked) return;
    if (item.type === 'custom') {
      const inp = document.getElementById('custom_'+item.id);
      total += Number(inp?.value||0);
    } else if (item.type === 'bulanan' && student) {
      const bulanDipilih = getSppMonthsSelected();
      const sppRate = student.spp || item.amount || 0;
      total += sppRate * Math.max(1, bulanDipilih.length);
    } else if (item.id === 'pangkal' && student) {
      total += pangkalTunggakan(student);
    } else {
      total += item.amount||0;
    }
  });
  document.getElementById('inputTotal').textContent = rp(total);
}

async function submitPayment() {
  const nama = document.getElementById('inputNama').value;
  if (!nama) { toast('⚠️ Pilih nama santri terlebih dahulu!'); return; }
  const student = getStudent(nama);
  const items = [];
  appState.payItems.filter(i=>i.active).forEach(item => {
    const chk = document.getElementById('chk_'+item.id);
    if (!chk || !chk.checked) return;
    let amount = item.amount;
    if (item.type === 'custom') {
      const inp = document.getElementById('custom_'+item.id);
      amount = Number(inp?.value||0);
    } else if (item.type === 'bulanan' && student) {
      amount = student.spp || item.amount || 0;
    } else if (item.id === 'pangkal' && student) {
      amount = pangkalTunggakan(student);
    }
    if (amount <= 0 && item.type !== 'custom') return;

    if (item.type === 'bulanan') {
      // Ambil semua bulan yang dipilih
      const bulanDipilih = getSppMonthsSelected();
      if (!bulanDipilih.length) { toast('⚠️ Pilih minimal 1 bulan SPP!'); items.length = 0; return; }
      const totalSPP = (student.spp || item.amount || 0) * bulanDipilih.length;
      items.push({ id: item.id, name: item.name, amount: totalSPP, bulanList: bulanDipilih });
    } else {
      items.push({ id: item.id, name: item.name, amount, bulan: null });
    }
  });
  if (!items.length) { toast('⚠️ Centang minimal 1 item bayar!'); return; }

  if (!items.length) { toast('⚠️ Centang minimal 1 item bayar!'); return; }

  // Update student data
  const si = appState.students.findIndex(s=>s.nama===nama);
  items.forEach(it => {
    if (it.bulanList?.length) {
      it.bulanList.forEach(b => {
        if (!appState.students[si].spp_paid_months.includes(b))
          appState.students[si].spp_paid_months.push(b);
      });
    }
    if (it.id === 'pangkal') {
      appState.students[si].pangkal_paid = (appState.students[si].pangkal_paid||0) + it.amount;
    }
  });

  const now = new Date();
  const timeStr = now.toLocaleDateString('id-ID')+' '+now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  const totalAmt = items.reduce((a,i)=>a+i.amount,0);
  const txn = {
    nama, kelas: student.kelas,
    jenis: items.map(i => i.bulanList?.length ? i.name+' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')' : i.name).join(', '),
    nominal: totalAmt, time: timeStr, catatan: document.getElementById('inputCatatan').value
  };
  appState.transactions.push(txn);
  saveSiswa(appState.students[si]); // hanya simpan siswa yang berubah
  saveTransaction(txn);

  // Render session table
  const tbody = document.querySelector('#sessionTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `<td><strong>${nama}</strong></td><td>${student.kelas}</td><td>${items.map(i=>i.name+(i.bulanList?.length?' ('+i.bulanList.map(b=>MONTH_FULL[b]).join(', ')+')':i.bulan?' ('+MONTH_FULL[i.bulan]+')':'')).join(', ')}</td><td><strong>${rp(totalAmt)}</strong></td><td>${timeStr}</td><td style="white-space:nowrap;"><button class="btn btn-primary btn-sm" onclick="cetakKuitansiById('${nama}','${timeStr}')">🖨️ Kuitansi</button> <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()">✕</button></td>`;
  if(tbody.firstChild?.tagName==='TR' && tbody.firstChild.querySelector('[colspan]')) tbody.innerHTML='';
  tbody.prepend(row);

  // Simpan ke tabel kuitansi Supabase (await agar ID tersedia saat cetak)
  const noKwt = await generateNoKuitansi();
  const kwtData = {
    no_kuitansi: noKwt,
    nama, kelas: student.kelas, nisn: student.nisn||'',

    items: items.flatMap(i => {
      if (i.bulanList?.length) return i.bulanList.map(b => ({ name: i.name, amount: i.amount / i.bulanList.length, bulan: b }));
      if (i.crossItem) return [{ name: i.name, amount: i.amount, bulan: i.crossItem.bulan||null }];
      return [{ name: i.name, amount: i.amount, bulan: i.bulan||null }];
    }),
    total: totalAmt, catatan: txn.catatan, dicetak: false,
    ta_label: getProfil().ta || '',
  };
  try {
    const res = await sb('kuitansi', 'POST', kwtData, {'Prefer':'return=representation'});
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
  <title>Kuitansi — ${data.nama}</title>
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
