// ── SiPay · Wizard Pindah Tahun Ajaran ──
// ══ WIZARD PINDAH TA ══
let wizTargetTA = null;
let wizSelectedStudents = [];
let wizKenaikanMap = {};

function openWizardPindahTA() {
  wizTargetTA = null; wizSelectedStudents = []; wizKenaikanMap = {};
  wizGoStep(1);
  // Isi opsi TA tujuan (semua kecuali aktif)
  const opts = document.getElementById('wizTAOptions');
  const choices = allTA.filter(t => !t.is_active);
  if (!choices.length) {
    opts.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Tidak ada TA lain. Tambah TA baru dulu.</div>';
  } else {
    opts.innerHTML = choices.map(t => `
      <div onclick="wizSelectTA('${t.id}','${t.label}',this)"
        style="padding:12px 16px;border-radius:10px;border:2px solid var(--border);cursor:pointer;font-size:14px;font-weight:600;transition:all .18s;"
        data-ta-id="${t.id}">
        📅 ${t.label}
      </div>`).join('');
  }
  document.getElementById('wizardTAModal').classList.add('open');
}

function wizSelectTA(id, label, el) {
  wizTargetTA = { id, label };
  document.querySelectorAll('#wizTAOptions > div').forEach(d => {
    d.style.borderColor = 'var(--border)';
    d.style.background = '';
  });
  el.style.borderColor = 'var(--primary)';
  el.style.background = 'var(--primary-pale)';
}

function closeWizardTA() {
  document.getElementById('wizardTAModal').classList.remove('open');
}

function wizGoStep(n) {
  if (n === 2 && !wizTargetTA) { toast('⚠️ Pilih TA tujuan dulu'); return; }
  if (n === 2) {
    // Render daftar siswa dengan checkbox
    const list = document.getElementById('wizSiswaList');
    list.innerHTML = appState.students.map(s => `
      <div class="kenaikan-row">
        <input type="checkbox" id="wiz_chk_${s.nama}" data-nama="${s.nama}" checked onchange="wizUpdateSelected()">
        <div style="flex:1;">
          <strong style="font-size:13px;">${s.nama}</strong>
          <span style="font-size:12px;color:var(--text-muted);margin-left:6px;">Kelas ${s.kelas}</span>
        </div>
      </div>`).join('') || '<div style="color:var(--text-muted);font-size:13px;padding:8px;">Tidak ada data siswa di TA ini</div>';
    wizUpdateSelected();
  }
  if (n === 3) {
    // Kumpulkan siswa terpilih
    wizSelectedStudents = appState.students.filter(s => {
      const chk = document.getElementById('wiz_chk_' + s.nama);
      return chk && chk.checked;
    });
    if (!wizSelectedStudents.length) { toast('⚠️ Pilih minimal 1 siswa'); return; }
    // Render kenaikan kelas
    const list = document.getElementById('wizKenaikanList');
    list.innerHTML = wizSelectedStudents.map(s => {
      const kelasSekarang = s.kelas;
      let defaultNext = kelasSekarang;
      if (kelasSekarang === '7') defaultNext = '8';
      else if (kelasSekarang === '8') defaultNext = '9';
      else if (kelasSekarang === '9') defaultNext = 'lulus';
      wizKenaikanMap[s.nama] = defaultNext;
      return `
        <div class="kenaikan-row">
          <div style="flex:1;">
            <strong style="font-size:13px;">${s.nama}</strong>
          </div>
          <span style="font-size:12px;color:var(--text-muted);">Kelas ${kelasSekarang} →</span>
          <select onchange="wizKenaikanMap['${s.nama}']=this.value" style="padding:5px 8px;border-radius:6px;border:1.5px solid var(--border);">
            <option value="7" ${defaultNext==='7'?'selected':''}>7</option>
            <option value="8" ${defaultNext==='8'?'selected':''}>8</option>
            <option value="9" ${defaultNext==='9'?'selected':''}>9</option>
            <option value="lulus" ${defaultNext==='lulus'?'selected':''}>Lulus / Keluar</option>
            <option value="${kelasSekarang}" ${defaultNext===kelasSekarang&&!['7','8','9','lulus'].filter(x=>x!==kelasSekarang).includes(defaultNext)?'selected':''}>Tinggal (${kelasSekarang})</option>
          </select>
        </div>`;
    }).join('');
  }
  if (n === 4) {
    const lanjut  = wizSelectedStudents.filter(s => wizKenaikanMap[s.nama] !== 'lulus');
    const lulus   = wizSelectedStudents.filter(s => wizKenaikanMap[s.nama] === 'lulus');
    document.getElementById('wizSummary').innerHTML = `
      <div style="background:var(--primary-pale);border-radius:12px;padding:16px;font-size:13px;line-height:1.8;">
        <div><strong>TA Asal:</strong> ${activeTA?.label}</div>
        <div><strong>TA Tujuan:</strong> ${wizTargetTA.label}</div>
        <div><strong>Siswa dilanjutkan:</strong> ${lanjut.length} orang</div>
        <div><strong>Siswa lulus/keluar:</strong> ${lulus.length} orang</div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-muted);">Transaksi TA lama tetap tersimpan dan bisa dilihat dengan beralih ke TA tersebut.</div>
      </div>`;
  }
  // Update step indicator
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('ws'+i);
    if (!el) return;
    el.className = 'wizard-step' + (i < n ? ' done' : i === n ? ' active' : '');
  });
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('wiz_step'+i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

function wizSelectAll(val) {
  document.querySelectorAll('#wizSiswaList input[type=checkbox]').forEach(c => c.checked = val);
  wizUpdateSelected();
}
function wizUpdateSelected() {
  const count = [...document.querySelectorAll('#wizSiswaList input[type=checkbox]')].filter(c => c.checked).length;
  // bisa tampilkan counter jika mau
}

async function confirmWizardTA() {
  const btn = document.querySelector('#wiz_step4 .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
  try {
    const lanjut = wizSelectedStudents.filter(s => wizKenaikanMap[s.nama] !== 'lulus');

    // Cek tunggakan di TA asal untuk siswa yang dilanjutkan
    const newStudents = lanjut.map(s => {
      const kelasLama = s.kelas;
      const kelasBaru = wizKenaikanMap[s.nama];
      // Tunggakan: bulan SPP yang belum dibayar di TA asal
      const unpaidMonths = MONTHS.filter(m => !s.spp_paid_months.includes(m));
      const crossDebt = [];
      const pangkalSisa = Math.max(0, (s.pangkal || 0) - (s.pangkal_paid || 0));

      // Format konsisten — hanya track SPP tunggakan
      // Pangkal tidak masuk cross_ta_debt karena dihitung kumulatif dari semua TA
      if (unpaidMonths.length > 0 && s.spp > 0) {
        crossDebt.push({
          ta_id:      activeTA.id,
          ta_label:   activeTA.label,
          spp_months: unpaidMonths,
          spp:        s.spp || 0,
        });
      }
      return {
        nama: s.nama, kelas: kelasBaru, nisn: s.nisn || '',
        spp: s.spp,
        // Pangkal: bawa nominal asli, reset paid ke 0 di TA baru
        // karena pangkalTunggakan sekarang menghitung kumulatif dari semua TA
        pangkal: s.pangkal, pangkal_paid: 0,
        spp_paid_months: [], // Reset SPP untuk TA baru
        cross_ta_debt: [...(s.cross_ta_debt || []), ...crossDebt],
        ta_id: wizTargetTA.id,
      };
    });

    if (newStudents.length > 0) {
      await sb('students?on_conflict=nama,ta_id', 'POST', newStudents, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    }

    // Aktifkan TA tujuan
    await setActiveTA(wizTargetTA.id);
    closeWizardTA();
    toast(`✅ Berhasil pindah ke TA ${wizTargetTA.label}! ${lanjut.length} siswa dilanjutkan.`);
  } catch(e) {
    toast('⚠️ Gagal: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Proses Pindah TA'; }
  }
}

// ── helpers ──
