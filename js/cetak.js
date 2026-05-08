// ── SiPay · Cetak & PDF ──
function renderCetakPage() {
  const sel = document.getElementById('cetakNama');
  sel.innerHTML = '<option value="">-- Pilih Nama --</option>' +
    appState.students.map(s=>`<option value="${s.nama}">${s.nama} — ${s.kelas}</option>`).join('');
  document.getElementById('cetakTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('cetakTanggalTotal').value = new Date().toISOString().split('T')[0];
}

function showCetakForStudent(nama) {
  showPage('cetak');
  setTimeout(() => {
    document.getElementById('cetakNama').value = nama;
    onCetakStudentSelect();
  }, 100);
}

function onCetakStudentSelect() {
  const nama = document.getElementById('cetakNama').value;
  const s = getStudent(nama);
  document.getElementById('cetakKelas').textContent = s ? s.kelas : '—';
  document.getElementById('cetakNISN').textContent = s ? (s.nisn||'—') : '—';
}

function switchCetakTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('cetak-individu').style.display = tab==='individu'?'block':'none';
  document.getElementById('cetak-total').style.display    = tab==='total'?'block':'none';
  document.getElementById('cetak-export').style.display   = tab==='export'?'block':'none';
}

// ══════════════════════════════════════════
// EXPORT / BACKUP KE EXCEL
// ══════════════════════════════════════════

function xlsxReady(cb) {
  if (window.XLSX) { cb(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = cb;
  document.head.appendChild(s);
}

function downloadXlsx(wb, filename) {
  XLSX.writeFile(wb, filename);
}

// Helper: siswa → baris excel
function siswaToRow(s) {
  const sisa = Math.max(0, (s.pangkal||0) - (s.pangkal_paid||0));
  const sppBayar = (s.spp_paid_months||[]).length;
  const tunggak = totalTunggakan(s);
  const bulanLunas = MONTHS.filter(m => (s.spp_paid_months||[]).includes(m)).map(m => MONTH_FULL[m]).join(', ');
  return {
    'Nama': s.nama,
    'Kelas': s.kelas,
    'NISN': s.nisn || '',
    'SPP/Bulan': s.spp || 0,
    'Total Pangkal': s.pangkal || 0,
    'Pangkal Dibayar': s.pangkal_paid || 0,
    'Sisa Pangkal': sisa,
    'Bulan SPP Lunas': sppBayar,
    'Bulan Lunas (detail)': bulanLunas,
    'Total Tunggakan': tunggak,
    'Status': tunggak > 0 ? 'Belum Lunas' : 'Lunas',
  };
}

async function exportSiswaExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = appState.students.map(s => siswaToRow(s));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [24,6,12,10,12,12,12,8,32,12,10].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');
      const tgl = new Date().toISOString().slice(0,10);
      downloadXlsx(wb, `SiPay_DataSantri_${tgl}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportTransaksiExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = await sb('transactions?select=*&order=created_at.desc');
      const data = rows.map(r => ({
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : r.time || '—',
        'Jam': r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '—',
        'Nama': r.nama,
        'Kelas': r.kelas,
        'Jenis Bayar': r.jenis,
        'Nominal': r.nominal || 0,
        'Catatan': r.catatan || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [12,6,24,6,32,12,24].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
      downloadXlsx(wb, `SiPay_Transaksi_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportKuitansiExcel(mode) {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan data...');
    try {
      const rows = await sb('kuitansi?select=*&order=created_at.desc');
      const data = rows.map(r => ({
        'No. Kuitansi': r.no_kuitansi || '—',
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '—',
        'Nama': r.nama,
        'Kelas': r.kelas,
        'NISN': r.nisn || '',
        'Rincian': Array.isArray(r.items) ? r.items.map(i => i.name).join(', ') : '—',
        'Total': r.total || 0,
        'Catatan': r.catatan || '',
        'Dicetak': r.dicetak ? 'Ya' : 'Belum',
        'Jenis': r.is_koreksi ? 'Koreksi' : 'Normal',
        'Ref Koreksi': r.ref_no_kuitansi || '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [16,12,24,6,12,36,12,24,8,8,16].map(w => ({wch: w}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Kuitansi');
      downloadXlsx(wb, `SiPay_Kuitansi_${new Date().toISOString().slice(0,10)}.xlsx`);
      toast('✅ Export berhasil!');
    } catch(e) { toast('⚠️ Gagal export: ' + e.message); }
  });
}

async function exportBackupLengkap() {
  xlsxReady(async () => {
    toast('⏳ Menyiapkan backup lengkap...');
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Siswa
      const allSiswa = await sb('students?select=*&order=nama');
      const wsSiswa = XLSX.utils.json_to_sheet(
        allSiswa.map(s => siswaToRow({
          ...s,
          spp_paid_months: Array.isArray(s.spp_paid_months) ? s.spp_paid_months : [],
        }))
      );
      wsSiswa['!cols'] = [24,6,12,10,12,12,12,8,32,12,10].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsSiswa, 'Data Santri');

      // Sheet 2: Transaksi
      const allTxn = await sb('transactions?select=*&order=created_at.desc');
      const wsTxn = XLSX.utils.json_to_sheet(allTxn.map(r => ({
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : r.time || '—',
        'Jam': r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '—',
        'Nama': r.nama, 'Kelas': r.kelas,
        'Jenis Bayar': r.jenis, 'Nominal': r.nominal || 0, 'Catatan': r.catatan || '',
      })));
      wsTxn['!cols'] = [12,6,24,6,32,12,24].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsTxn, 'Transaksi');

      // Sheet 3: Kuitansi
      const allKwt = await sb('kuitansi?select=*&order=created_at.desc');
      const wsKwt = XLSX.utils.json_to_sheet(allKwt.map(r => ({
        'No. Kuitansi': r.no_kuitansi || '—',
        'Tanggal': r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : '—',
        'Nama': r.nama, 'Kelas': r.kelas, 'NISN': r.nisn || '',
        'Rincian': Array.isArray(r.items) ? r.items.map(i=>i.name).join(', ') : '—',
        'Total': r.total || 0, 'Catatan': r.catatan || '',
        'Dicetak': r.dicetak ? 'Ya' : 'Belum',
        'Jenis': r.is_koreksi ? 'Koreksi' : 'Normal',
      })));
      wsKwt['!cols'] = [16,12,10,24,6,12,36,12,24,8,8].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsKwt, 'Kuitansi');

      // Sheet 4: Tunggakan ringkasan
      const wsTk = XLSX.utils.json_to_sheet(
        appState.students.map(s => ({
          'Nama': s.nama, 'Kelas': s.kelas, 'NISN': s.nisn || '',
          'Tunggakan SPP': sppTunggakan(s),
          'Tunggakan Pangkal': pangkalTunggakan(s),
          'Tunggakan Lintas TA': crossTATunggakan(s),
          'Total Tunggakan': totalTunggakan(s),
          'Status': totalTunggakan(s) > 0 ? 'Belum Lunas' : 'Lunas',
        }))
      );
      wsTk['!cols'] = [24,6,12,14,16,16,14,10].map(w => ({wch: w}));
      XLSX.utils.book_append_sheet(wb, wsTk, 'Tunggakan');

      const tgl = new Date().toISOString().slice(0,10);
      downloadXlsx(wb, `SiPay_Backup_Lengkap_${tgl}.xlsx`);
      toast('✅ Backup lengkap berhasil didownload!');
    } catch(e) { toast('⚠️ Gagal backup: ' + e.message); }
  });
}

function buildSuratHTML(s, tgl) {
  const sppT = sppTunggakan(s), pangkalT = pangkalTunggakan(s);
  const totalT = sppT + pangkalT;
  const tglFmt = new Date(tgl).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  const bulanBelum = MONTHS.filter(m=>!s.spp_paid_months.includes(m)&&s.spp>0);
  const P = getProfil();
  const taLabel = '';
  let no = 0;
  return `
  <div class="pdf-preview" id="suratPreview">
    <div class="kop-surat">
      <div class="kop-logo">${getLogo() ? `<img src="${getLogo()}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '🕌'}</div>
      <div class="kop-text">
        <h2>${P.nama||'MADRASAH TERPADU'}</h2>
        <p>${P.alamat||''}${P.kota?', '+P.kota:''}${P.provinsi?', '+P.provinsi:''}</p>
        <p>${P.telp?'Telp. '+P.telp:''} ${P.email?'| Email: '+P.email:''} ${P.nsm?'| NSM: '+P.nsm:''}</p>
      </div>
    </div>
    <div class="surat-body">
      <h3>SURAT PEMBERITAHUAN PEMBAYARAN</h3>
      <p style="margin-bottom:12px;line-height:2;font-size:11pt;">
        Kepada Yth.<br>
        <strong>Orang Tua / Wali Santri</strong><br>
        Nama Santri &nbsp;: <strong>${s.nama}</strong><br>
        Kelas &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${s.kelas}<br>
        NISN &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: ${s.nisn||'—'}
      </p>
      <p style="text-align:justify;line-height:1.8;margin-bottom:12px;font-size:11pt;">
        Dengan hormat, bersama surat ini kami sampaikan informasi pembayaran santri yang bersangkutan untuk Tahun Ajaran Berjalan sebagaimana tercantum di bawah ini:
      </p>
      <table class="data-table-pdf">
        <thead><tr><th style="width:30px">No</th><th>Jenis Pembayaran</th><th>Keterangan</th><th style="width:110px">Tagihan (Rp)</th><th style="width:110px">Terbayar (Rp)</th><th style="width:110px">Sisa (Rp)</th></tr></thead>
        <tbody>
          ${s.spp > 0 ? `<tr>
            <td style="text-align:center">${++no}</td>
            <td>SPP Bulanan</td>
            <td style="font-size:10pt">${(s.spp_paid_months||[]).length} bulan lunas${bulanBelum.length>0?';<br>Belum: '+bulanBelum.map(m=>MONTH_FULL[m]).join(', '):''}</td>
            <td style="text-align:right">${(s.spp*12).toLocaleString('id-ID')}</td>
            <td style="text-align:right">${((s.spp_paid_months||[]).length*s.spp).toLocaleString('id-ID')}</td>
            <td style="text-align:right;${sppT>0?'color:#c0392b;font-weight:bold;':''}">${sppT.toLocaleString('id-ID')}</td>
          </tr>` : ''}
          ${s.pangkal > 0 ? `<tr>
            <td style="text-align:center">${++no}</td>
            <td>Uang Pangkal</td>
            <td style="font-size:10pt">Terbayar ${rp(s.pangkal_paid||0)}</td>
            <td style="text-align:right">${s.pangkal.toLocaleString('id-ID')}</td>
            <td style="text-align:right">${(s.pangkal_paid||0).toLocaleString('id-ID')}</td>
            <td style="text-align:right;${pangkalT>0?'color:#c0392b;font-weight:bold;':''}">${pangkalT.toLocaleString('id-ID')}</td>
          </tr>` : ''}
          <tr style="background:#f0f0f0;">
            <td colspan="3" style="text-align:right;font-weight:bold;">TOTAL TUNGGAKAN</td>
            <td colspan="3" style="text-align:right;font-weight:bold;font-size:13pt;${totalT>0?'color:#c0392b;':''}">${totalT.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>
      ${totalT > 0 ? `<p style="margin:10px 0;padding:8px 12px;background:#fff3cd;border-radius:4px;border-left:4px solid #c8a04a;font-size:10.5pt;">
        <strong>Terbilang:</strong> <em>${terbilangFull(totalT)}</em></p>`
      : `<p style="margin:10px 0;padding:8px 12px;background:#d4edda;border-radius:4px;border-left:4px solid #1e7c45;font-size:10.5pt;"><strong>✓ Alhamdulillah, semua pembayaran telah lunas!</strong></p>`}
      <p style="text-align:justify;line-height:1.8;margin:10px 0;font-size:11pt;">Demikian surat pemberitahuan ini kami sampaikan. Apabila pembayaran telah dilakukan, mohon untuk mengabaikan surat ini. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.</p>
      <div class="ttd-section">
        <div class="ttd-box">
          <p>Mengetahui,<br>Kepala Madrasah</p>
          <div class="ttd-space"></div>
          <p><strong>${P.kepsek||'__________________'}</strong>${P.kepsek_nip?'<br><small>'+P.kepsek_nip+'</small>':''}</p>
        </div>
        <div class="ttd-box">
          <p>${P.kota||'Tarakan'}, ${tglFmt}<br>Bendahara</p>
          <div class="ttd-space"></div>
          <p><strong>${P.bendahara||'__________________'}</strong>${P.bendahara_nip?'<br><small>'+P.bendahara_nip+'</small>':''}</p>
        </div>
      </div>
    </div>
  </div>`;
}

function previewPDF() {
  const nama = document.getElementById('cetakNama').value;
  const tgl  = document.getElementById('cetakTanggal').value;
  if (!nama) { toast('⚠️ Pilih nama santri!'); return; }
  const s = getStudent(nama);
  document.getElementById('pdfPreviewArea').innerHTML =
    `<div class="pdf-preview-wrap">${buildSuratHTML(s, tgl)}</div>`;
}

function generatePDFIndividu() {
  const nama = document.getElementById('cetakNama').value;
  const tgl  = document.getElementById('cetakTanggal').value;
  if (!nama) { toast('⚠️ Pilih nama santri!'); return; }
  const s = getStudent(nama);
  printHTML(buildSuratHTML(s, tgl), `Surat_Tagihan_${nama.replace(/ /g,'_')}`);
}

function previewPDFTotal() {
  const kelasFil = document.getElementById('cetakKelasFilter').value;
  const tgl = document.getElementById('cetakTanggalTotal').value;
  document.getElementById('pdfPreviewTotal').innerHTML =
    `<div class="pdf-preview-wrap">${buildRekapTotalHTML(kelasFil, tgl)}</div>`;
}

function generatePDFTotal() {
  const kelasFil = document.getElementById('cetakKelasFilter').value;
  const tgl = document.getElementById('cetakTanggalTotal').value;
  printHTML(buildRekapTotalHTML(kelasFil, tgl), `Rekap_Pembayaran${kelasFil?'_Kelas'+kelasFil:''}`);
}

// ── Core print / save-as-PDF ──
function printHTML(bodyHTML, filename) {
  const P = getProfil();
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { toast('⚠️ Popup diblokir browser. Izinkan popup lalu coba lagi.'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: 'Times New Roman', Times, serif; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    .pdf-preview {
      width: 210mm; min-height: 297mm;
      padding: 20mm 20mm 20mm 25mm;
      margin: 0 auto;
      font-size: 12pt; color: #000;
      box-sizing: border-box;
    }
    .kop-surat { display: flex; align-items: center; gap: 14px; border-bottom: 3px double #000; padding-bottom: 10px; margin-bottom: 14px; }
    .kop-logo { width: 70px; height: 70px; border-radius: 50%; background: #1e5631; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; overflow: hidden; }
    .kop-logo img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .kop-text { flex: 1; text-align: center; }
    .kop-text h2 { font-size: 16pt; font-weight: 700; margin: 0 0 3px; }
    .kop-text p { font-size: 10pt; color: #333; line-height: 1.5; }
    .surat-body { margin-top: 12px; }
    .surat-body h3 { text-align: center; font-size: 13pt; font-weight: 700; text-decoration: underline; margin: 14px 0 10px; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin: 10px 0; }
    td, th { border: 1px solid #555; padding: 5px 8px; }
    th { background: #e8e8e8; font-weight: 700; text-align: center; }
    .ttd-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; text-align: center; font-size: 11pt; }
    .ttd-space { height: 52px; }
    .print-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 999;
      display: flex; gap: 10px;
    }
    .print-btn button {
      padding: 10px 22px; font-size: 14px; font-weight: 700;
      border: none; border-radius: 8px; cursor: pointer;
    }
    .btn-print { background: #1e5631; color: #fff; }
    .btn-close { background: #ccc; color: #333; }
  </style>
</head>
<body>
  ${bodyHTML}
  <div class="print-btn no-print">
    <button class="btn-close" onclick="window.close()">✕ Tutup</button>
    <button class="btn-print" onclick="window.print()">🖨️ Print / Simpan PDF</button>
  </div>
  <script>
    // Auto-trigger print dialog optional
  <\/script>
</body>
</html>`);
  win.document.close();
}

function buildRekapTotalHTML(kelasFil, tgl) {
  const P2 = getProfil();
  const tglFmt = new Date(tgl).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  let list = appState.students.filter(s => !kelasFil || s.kelas === kelasFil);
  const totalTagihan = list.reduce((a,s) => a + (s.spp>0?s.spp*12:0) + (s.pangkal||0), 0);
  const totalBayar = list.reduce((a,s) => a + (s.spp||0)*(s.spp_paid_months||[]).length + (s.pangkal_paid||0), 0);
  const totalTk = list.reduce((a,s)=>a+totalTunggakan(s),0);
  return `
  <div class="pdf-preview" id="suratPreviewTotal">
    <div class="kop-surat">
      <div class="kop-logo">${getLogo() ? `<img src="${getLogo()}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : '🕌'}</div>
      <div class="kop-text">
        <h2>${P2.nama}</h2>
        <p>${P2.alamat}${P2.kota?', '+P2.kota:''}${P2.provinsi?', '+P2.provinsi:''}<br>${P2.telp?'Telp. '+P2.telp+' ':''} ${P2.email?'| Email: '+P2.email:''}</p>
      </div>
    </div>
    <div class="surat-body">
      <h3>REKAP PEMBAYARAN SANTRI ${kelasFil?'KELAS '+kelasFil:'SELURUH KELAS'}</h3>
      <p style="margin-bottom:10px;">Tahun Ajaran 2025/2026 &nbsp;|&nbsp; Per Tanggal: ${tglFmt}<br>
      Total Santri: <strong>${list.length}</strong> orang</p>
      <table class="data-table-pdf">
        <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>SPP Dibayar</th><th>Pangkal Dibayar</th><th>Tunggakan</th></tr></thead>
        <tbody>
          ${list.map((s,i)=>{
            const tk = totalTunggakan(s);
            return `<tr${tk>0?' style="background:#fff5f5;"':''}>
              <td style="text-align:center">${i+1}</td>
              <td>${s.nama}</td><td>${s.kelas}</td>
              <td style="text-align:right">${((s.spp_paid_months||[]).length*s.spp).toLocaleString('id-ID')}</td>
              <td style="text-align:right">${(s.pangkal_paid||0).toLocaleString('id-ID')}</td>
              <td style="text-align:right;${tk>0?'color:#c0392b;font-weight:bold;':''}">${tk>0?tk.toLocaleString('id-ID'):'Lunas'}</td>
            </tr>`;
          }).join('')}
          <tr style="background:#f0f0f0;font-weight:bold;">
            <td colspan="3" style="text-align:right">TOTAL</td>
            <td style="text-align:right">${list.reduce((a,s)=>a+(s.spp||0)*(s.spp_paid_months||[]).length,0).toLocaleString('id-ID')}</td>
            <td style="text-align:right">${list.reduce((a,s)=>a+(s.pangkal_paid||0),0).toLocaleString('id-ID')}</td>
            <td style="text-align:right;color:#c0392b;">${totalTk.toLocaleString('id-ID')}</td>
          </tr>
        </tbody>
      </table>
      <div class="ttd-section" style="margin-top:20px;">
        <div class="ttd-box"><p>Mengetahui,<br>Kepala Madrasah</p><div class="ttd-space"></div><p><strong>${P2.kepsek}</strong>${P2.kepsek_nip?'<br><small>'+P2.kepsek_nip+'</small>':''}</p></div>
        <div class="ttd-box"><p>${P2.kota||'Tarakan'}, ${tglFmt}<br>Bendahara</p><div class="ttd-space"></div><p><strong>${P2.bendahara}</strong>${P2.bendahara_nip?'<br><small>'+P2.bendahara_nip+'</small>':''}</p></div>
      </div>
    </div>
  </div>`;
}

function exportTunggakanPDF() {
  previewPDFTotal(); // reuse but filtered
  showPage('cetak');
  setTimeout(() => switchCetakTab('total', document.querySelectorAll('.tab')[1]), 100);
}


// ══════════════════════════════════════════
