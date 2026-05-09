// ── SiPay · Import Siswa (Excel/CSV) ──
// ══════════════════════════════════════════
function impGoStep(n) {
  [1,2,3].forEach(i => {
    document.getElementById('imp_step'+i).style.display = i===n ? 'block' : 'none';
    const ind = document.getElementById('imp_step'+i+'_ind');
    ind.style.background = i===n ? 'var(--primary)' : i<n ? 'var(--primary-light)' : 'var(--border)';
    ind.style.color = i<=n ? '#fff' : 'var(--text-muted)';
  });
}
function openImportModal() {
  document.getElementById('tambahChoiceModal').classList.remove('open');
  document.getElementById('importFile').value = '';
  importBuffer = [];
  impGoStep(1);
  document.getElementById('importModal').classList.add('open');
}

// ══════════════════════════════════════════
// IMPORT EXCEL / CSV
// ══════════════════════════════════════════
let importBuffer = [];
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('importModal').addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
});

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result);
    reader.readAsText(file);
  } else {
    if (typeof XLSX !== 'undefined') {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, {type:'array'});
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, {defval:''});
          parseRows(data);
        } catch(err) {
          toast('⚠️ Gagal membaca file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      toast('⚠️ Library Excel belum siap. Coba refresh halaman atau gunakan format CSV.');
    }
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase().replace(/"/g,''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/"/g,''));
    const obj = {};
    headers.forEach((h,idx) => obj[h] = cells[idx]||'');
    rows.push(obj);
  }
  parseRows(rows);
}

function parseRows(rows) {
  importBuffer = [];
  const MONTHS_LIST = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
  const MAP = {
    NAMA: ['NAMA','NAME','NAMA LENGKAP','NAMA_LENGKAP'],
    KELAS: ['KELAS','CLASS','GRADE','TINGKAT - ROMBEL','TINGKAT_ROMBEL','ROMBEL'],
    NISN: ['NISN'],
    SPP: ['SPP','SPP_BULANAN','SPP BULANAN'],
    PANGKAL: ['PANGKAL','UANG_PANGKAL','UANG PANGKAL','UANGPANGKAL'],
    PANGKAL_PAID: ['PANGKAL_PAID','SUDAH_BAYAR_PANGKAL','BAYAR_PANGKAL','SUDAH BAYAR PANGKAL']
  };
  function findKey(obj, keys) {
    for (const k of keys) {
      const variants = [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g,' ')];
      for (const v of variants) {
        if (obj[v] !== undefined && obj[v] !== '') return obj[v];
      }
    }
    return '';
  }
  function normalizeKelas(k) {
    k = String(k).trim();
    if (/VIII/i.test(k)) return '8';
    if (/IX/i.test(k))   return '9';
    if (/VII/i.test(k))  return '7';
    return k;
  }
  rows.forEach(row => {
    const nama = String(findKey(row, MAP.NAMA)||'').trim().toUpperCase();
    if (!nama || nama === 'NO' || nama === 'NAMA LENGKAP') return;
    const kelasRaw = findKey(row, MAP.KELAS);
    const kelas = normalizeKelas(kelasRaw);

    // Baca kolom SPP per bulan — cari kolom SPP_Jul, SPP_Agt, dst
    const spp_paid_months = [];
    MONTHS_LIST.forEach(m => {
      const keys = [`SPP_${m}`, `spp_${m}`, `SPP ${m}`, `spp ${m}`, m, m.toUpperCase()];
      for (const k of keys) {
        const val = row[k];
        if (val !== undefined && val !== '' && val != 0 && val !== false) {
          spp_paid_months.push(m);
          break;
        }
      }
    });

    importBuffer.push({
      nama,
      kelas,
      nisn: String(findKey(row, MAP.NISN)||'').trim().replace(/'/g,''),
      spp: Number(String(findKey(row, MAP.SPP)||'0').replace(/[^0-9]/g,''))||0,
      pangkal: Number(String(findKey(row, MAP.PANGKAL)||'0').replace(/[^0-9]/g,''))||0,
      pangkal_paid: Number(String(findKey(row, MAP.PANGKAL_PAID)||'0').replace(/[^0-9]/g,''))||0,
      spp_paid_months,
    });
  });
  if (!importBuffer.length) { toast('⚠️ Tidak ada data valid ditemukan di file'); return; }
  const tbody = document.querySelector('#importPreviewTable tbody');
  tbody.innerHTML = importBuffer.map((s,i) => {
    const bulanLabel = s.spp_paid_months.length
      ? `<span style="color:var(--primary);font-weight:600;">${s.spp_paid_months.length} bln</span> <span style="font-size:10px;color:var(--text-muted);">(${s.spp_paid_months.join(', ')})</span>`
      : '<span style="color:var(--text-muted);">—</span>';
    return `<tr><td>${i+1}</td><td>${s.nama}</td><td>${s.kelas||'—'}</td><td>${s.nisn||'—'}</td><td>${rp(s.spp)}</td><td>${rp(s.pangkal)}</td><td>${bulanLabel}</td></tr>`;
  }).join('');
  document.getElementById('importPreviewLabel').textContent = `✅ ${importBuffer.length} data santri siap diimport`;
  impGoStep(3);
}

function confirmImport() {
  let added = 0, updated = 0;
  importBuffer.forEach(s => {
    const existIdx = findExistingSiswaIdx(s);
    if (existIdx >= 0) {
      const merged = mergeSiswaData(appState.students[existIdx], s);
      appState.students[existIdx] = merged;
      const ai = allStudentsAllTA.findIndex(r => r.nama === merged.nama);
      if (ai >= 0) allStudentsAllTA[ai] = { ...merged };
      updated++;
    } else {
      appState.students.push(s);
      allStudentsAllTA.push({ ...s });
      added++;
    }
  });
  appState.students.sort((a,b) => a.nama.localeCompare(b.nama));
  saveState();
  document.getElementById('importModal').classList.remove('open');
  renderSiswaTable();
  renderTunggakan();
  renderDashboard();
  toast(`✅ Import: ${added} ditambahkan, ${updated} diperbarui/digabung`);
}

function downloadTemplate() {
  if (typeof XLSX !== 'undefined') {
    const headers = ['NAMA','KELAS','NISN','SPP','PANGKAL','PANGKAL_PAID',
      'SPP_Jul','SPP_Agt','SPP_Sep','SPP_Okt','SPP_Nov','SPP_Des',
      'SPP_Jan','SPP_Feb','SPP_Mar','SPP_Apr','SPP_Mei','SPP_Jun'];
    const contoh1 = ['CONTOH NAMA SANTRI','7','1234567890',700000,5000000,0, 1,1,1,0,0,0, 0,0,0,0,0,0];
    const contoh2 = ['NAMA SANTRI DUA',   '8','',500000,3000000,1000000, 1,1,1,1,1,1, 0,0,0,0,0,0];
    const contoh3 = ['NAMA SANTRI TIGA',  '9', '',600000,3000000,0,        0,0,0,0,0,0, 0,0,0,0,0,0];
    const wsData = [headers, contoh1, contoh2, contoh3];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    // Lebar kolom
    ws['!cols'] = [
      {wch:30},{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
      {wch:8},{wch:8},{wch:8},{wch:8},{wch:8},{wch:8},
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Santri');
    XLSX.writeFile(wb, 'template_import_santri.xlsx');
    toast('📋 Template Excel berhasil didownload');
  } else {
    const months = 'SPP_Jul,SPP_Agt,SPP_Sep,SPP_Okt,SPP_Nov,SPP_Des,SPP_Jan,SPP_Feb,SPP_Mar,SPP_Apr,SPP_Mei,SPP_Jun';
    const csv = `NAMA,KELAS,NISN,SPP,PANGKAL,PANGKAL_PAID,${months}\nCONTOH NAMA SANTRI,7,1234567890,700000,5000000,0,1,1,1,0,0,0,0,0,0,0,0,0\n`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'template_import_santri.csv';
    a.click();
    toast('📋 Template CSV berhasil didownload');
  }
}

// Drag & drop import zone — diinisialisasi setelah DOM siap
document.addEventListener('DOMContentLoaded', () => {
  const importZone = document.getElementById('importZone');
  if (importZone) {
    importZone.addEventListener('dragover', e => { e.preventDefault(); importZone.style.borderColor = 'var(--primary-light)'; importZone.style.background = 'var(--primary-pale)'; });
    importZone.addEventListener('dragleave', () => { importZone.style.borderColor = ''; importZone.style.background = ''; });
    importZone.addEventListener('drop', e => {
      e.preventDefault(); importZone.style.borderColor = ''; importZone.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file) { handleImportFile({files:[file]}); }
    });
  }
});

// ── INIT ──
