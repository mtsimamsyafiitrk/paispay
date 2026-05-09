// ── SiPay · Koreksi Pembayaran ──
// AI CATATAN — Analisa bukti transfer → isi catatan
// ══════════════════════════════════════════

// ── Tab Input Page ──
function switchInputTab(tab) {
  const isBayar = tab === 'bayar';
  document.getElementById('tabBayar').style.display   = isBayar ? 'block' : 'none';
  document.getElementById('tabKoreksi').style.display  = isBayar ? 'none'  : 'block';
  document.getElementById('tabBayarBtn').style.background   = isBayar ? 'var(--primary)' : 'transparent';
  document.getElementById('tabBayarBtn').style.color        = isBayar ? '#fff' : 'var(--text-muted)';
  document.getElementById('tabKoreksiBtn').style.background = isBayar ? 'transparent' : 'var(--primary)';
  document.getElementById('tabKoreksiBtn').style.color      = isBayar ? 'var(--text-muted)' : '#fff';
  if (!isBayar) resetKoreksiTab();
}

function resetKoreksiTab() {
  koreksiSelectedKwt = null;
  const srch = document.getElementById('koreksiNamaSearch');
  const nama = document.getElementById('koreksiNama');
  const cat  = document.getElementById('koreksiCatatan');
  if (srch) srch.value = '';
  if (nama) nama.value = '';
  if (cat)  cat.value  = '';
  showKoreksiInlineStep(1);
}

function showKoreksiInlineStep(n) {
  [1,2,3].forEach(i => {
    const el = document.getElementById('tkStep' + i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
  const ld = document.getElementById('koreksiLoading');
  if (ld) ld.style.display = 'none';
}

function tkBack(toStep) { showKoreksiInlineStep(toStep); }

// ══════════════════════════════════════════
// KOREKSI PEMBAYARAN
// ══════════════════════════════════════════
let koreksiSelectedKwt = null; // kuitansi yang dipilih untuk dikoreksi
let koreksiNamaSuggIdx = -1;

// ── Step 1: Autocomplete nama ──
function onKoreksiNamaSearch() {
  koreksiNamaSuggIdx = -1;
  const q = (document.getElementById('koreksiNamaSearch').value || '').toLowerCase().trim();
  const dd = document.getElementById('koreksiNamaDropdown');
  const list = q ? appState.students.filter(s => s.nama.toLowerCase().includes(q) || (s.nisn && s.nisn.includes(q))) : appState.students.slice(0, 20);
  if (!list.length) { dd.innerHTML = `<div style="padding:12px 16px;font-size:13px;color:var(--text-muted);">Tidak ditemukan</div>`; dd.style.display='block'; return; }
  dd.innerHTML = list.slice(0,12).map((s,i) => `
    <div class="koreksi-nama-item" data-idx="${i}" data-nama="${s.nama.replace(/"/g,'&quot;')}"
      onmousedown="selectKoreksiNama('${s.nama.replace(/'/g,"\\'")}')"
      onmouseenter="this.style.background='var(--primary-pale)'" onmouseleave="this.style.background=''"
      style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;">
      <div style="font-weight:600;">${s.nama}</div>
      <div style="font-size:11px;color:var(--text-muted);">Kelas ${s.kelas}${s.nisn?' · NISN '+s.nisn:''}</div>
    </div>`).join('');
  dd.style.display = 'block';
}

function onKoreksiNamaKeydown(e) {
  const items = document.querySelectorAll('.koreksi-nama-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); koreksiNamaSuggIdx = Math.min(koreksiNamaSuggIdx+1, items.length-1); items.forEach((el,i) => el.style.background = i===koreksiNamaSuggIdx?'var(--primary-pale)':''); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); koreksiNamaSuggIdx = Math.max(koreksiNamaSuggIdx-1, 0); items.forEach((el,i) => el.style.background = i===koreksiNamaSuggIdx?'var(--primary-pale)':''); }
  else if (e.key === 'Enter' && koreksiNamaSuggIdx >= 0) selectKoreksiNama(items[koreksiNamaSuggIdx].dataset.nama);
  else if (e.key === 'Escape') hideKoreksiDropdown();
}

function hideKoreksiDropdown() {
  const dd = document.getElementById('koreksiNamaDropdown');
  if (dd) dd.style.display = 'none';
}

async function selectKoreksiNama(nama) {
  document.getElementById('koreksiNama').value = nama;
  document.getElementById('koreksiNamaSearch').value = nama;
  hideKoreksiDropdown();
  await loadKoreksiKwtList(nama);
}

// ── Step 2: Daftar kuitansi ──
async function loadKoreksiKwtList(nama) {
  const listEl = document.getElementById('koreksiKwtList');
  listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;">Memuat...</div>';
  showKoreksiInlineStep(2);
  try {
    const rows = await sb('kuitansi?select=*&nama=eq.' + encodeURIComponent(nama) + '&is_koreksi=eq.false&order=created_at.desc&limit=20');
    if (!rows.length) { listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px;">Tidak ada kuitansi ditemukan.</div>'; return; }
    const fmt = n => Number(n||0).toLocaleString('id-ID');
    listEl.innerHTML = rows.map(r => {
      const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
      const sudahDikoreksi = !!r.dikoreksi_oleh;
      return `<div onclick="${sudahDikoreksi ? '' : `selectKoreksiKwt('${r.id}')`}"
        style="padding:12px 16px;border:2px solid ${sudahDikoreksi?'#e5e7eb':'var(--border)'};border-radius:12px;cursor:${sudahDikoreksi?'not-allowed':'pointer'};background:${sudahDikoreksi?'#f9fafb':'#fff'};opacity:${sudahDikoreksi?'.6':'1'};transition:.15s;"
        onmouseenter="if(!${sudahDikoreksi}) this.style.borderColor='var(--primary)'"
        onmouseleave="if(!${sudahDikoreksi}) this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--primary);">${r.no_kuitansi||'—'}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${tgl} · TA ${r.ta_label||'—'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;font-size:14px;">Rp ${fmt(r.total)}</div>
            ${sudahDikoreksi
              ? `<div style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:10px;margin-top:2px;">Sudah dikoreksi</div>`
              : `<div style="font-size:11px;color:var(--primary-light);">Klik untuk pilih →</div>`}
          </div>
        </div>
        ${r.catatan ? `<div style="font-size:11px;color:#666;margin-top:6px;">💬 ${r.catatan}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div style="color:var(--danger);padding:16px;font-size:13px;">Gagal: ${e.message}</div>`;
  }
}

// ── Step 3: Pilih item koreksi ──
async function selectKoreksiKwt(id) {
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) return;
    koreksiSelectedKwt = rows[0];
    const kwt = koreksiSelectedKwt;
    const fmt = n => Number(n||0).toLocaleString('id-ID');

    document.getElementById('koreksiRefLabel').innerHTML =
      `Kuitansi: <strong>${kwt.no_kuitansi}</strong> · Rp ${fmt(kwt.total)} · TA ${kwt.ta_label||'—'}`;

    // Render item-item kuitansi sebagai checklist koreksi
    const items = Array.isArray(kwt.items) ? kwt.items : [];
    const student = getStudent(kwt.nama);

    document.getElementById('koreksiItemList').innerHTML = items.map((item, i) => {
      const isPangkal = item.name?.toLowerCase().includes('pangkal');
      const pangkalPaidSekarang = student ? pangkalTunggakan(student) === 0 
        ? (student.pangkal||0) 
        : (student.pangkal_paid||0) : 0;
      return `<div style="border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;background:#fafafa;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="checkbox" id="koreksiChk_${i}" data-idx="${i}" style="margin-top:3px;width:16px;height:16px;accent-color:var(--primary);cursor:pointer;" onchange="toggleKoreksiItem(${i})">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${item.name}${item.bulan?' ('+(MONTH_FULL[item.bulan]||item.bulan)+')':''}</div>
            <div style="font-size:12px;color:var(--text-muted);">Nilai tercatat di kuitansi: <strong>Rp ${fmt(item.amount)}</strong></div>
            ${isPangkal ? `<div style="font-size:11px;color:#888;margin-top:2px;">Total pangkal dibayar saat ini: Rp ${fmt(pangkalPaidSekarang)} dari Rp ${fmt(student?.pangkal||0)}</div>` : ''}
          </div>
        </label>
        <!-- Input nilai koreksi (muncul saat dicentang) -->
        <div id="koreksiInput_${i}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-muted);">Pilih Tindakan</div>
          <select id="koreksiAksi_${i}" style="width:100%;padding:8px 12px;border:2px solid var(--primary-light);border-radius:8px;font-size:13px;font-family:inherit;outline:none;margin-bottom:8px;">
            <option value="batalkan">Batalkan item ini (pembayaran dianggap tidak terjadi)</option>
            <option value="koreksi_nilai">Koreksi nilai — ubah nominal yang benar</option>
          </select>
          <input type="number" id="koreksiVal_${i}" placeholder="Nilai yang benar (Rp)..." value="${item.amount}"
            style="width:100%;padding:8px 12px;border:2px solid var(--primary-light);border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;display:none;"
            oninput="updateKoreksiTotal()">
          ${isPangkal ? `<div id="koreksiPangkalInfo_${i}" style="display:none;margin-top:6px;font-size:11px;color:#888;"></div>` : ''}
        </div>
      </div>`;
    }).join('');

    // Listener untuk select aksi — berlaku untuk semua item termasuk pangkal
    items.forEach((item, i) => {
      const aksiEl = document.getElementById('koreksiAksi_' + i);
      if (aksiEl) {
        aksiEl.addEventListener('change', () => {
          const valEl  = document.getElementById('koreksiVal_' + i);
          const infoEl = document.getElementById('koreksiPangkalInfo_' + i);
          const isPangkal = item.name?.toLowerCase().includes('pangkal');
          if (valEl) valEl.style.display = aksiEl.value === 'koreksi_nilai' ? 'block' : 'none';
          if (isPangkal && infoEl) {
            if (aksiEl.value === 'batalkan') {
              infoEl.style.display = 'block';
              infoEl.innerHTML = '⚠️ Pembayaran pangkal sebesar <strong>Rp ' + fmt(item.amount) + '</strong> akan dikurangi dari total yang tercatat.';
            } else if (aksiEl.value === 'koreksi_nilai') {
              infoEl.style.display = 'block';
              infoEl.innerHTML = '✏️ Isikan nominal pangkal yang <strong>benar</strong> untuk kuitansi ini. Selisih akan disesuaikan otomatis.';
            } else {
              infoEl.style.display = 'none';
            }
          }
          updateKoreksiTotal();
        });
      }
    });

    showKoreksiInlineStep(3);
  } catch(e) { toast('⚠️ Gagal: ' + e.message); }
}

function toggleKoreksiItem(i) {
  const chk = document.getElementById('koreksiChk_' + i);
  const inp = document.getElementById('koreksiInput_' + i);
  if (inp) inp.style.display = chk?.checked ? 'block' : 'none';
  updateKoreksiTotal();
}

function updateKoreksiTotal() {
  // Placeholder — bisa dipakai untuk menampilkan ringkasan
}

// ── Proses koreksi ──
async function prosesKoreksi() {
  const kwt = koreksiSelectedKwt;
  if (!kwt) return;

  const items = Array.isArray(kwt.items) ? kwt.items : [];
  const catatan = document.getElementById('koreksiCatatan').value.trim();

  // Kumpulkan item yang dikoreksi
  const koreksiItems = [];
  items.forEach((item, i) => {
    const chk = document.getElementById('koreksiChk_' + i);
    if (!chk?.checked) return;
    const isPangkal = item.name?.toLowerCase().includes('pangkal');
    const aksiEl = document.getElementById('koreksiAksi_' + i);
    const valEl  = document.getElementById('koreksiVal_' + i);
    const aksi   = aksiEl?.value || 'batalkan';
    const nilaBaru = Number(valEl?.value) || 0;
    koreksiItems.push({ item, idx: i, aksi, nilaBaru, isPangkal });
  });

  if (!koreksiItems.length) { toast('⚠️ Pilih minimal 1 item untuk dikoreksi!'); return; }

  document.getElementById('koreksiLoading').style.display = 'block';
  [1,2,3].forEach(i => { const el = document.getElementById('koreksiStep'+i); if(el) el.style.display='none'; });

  try {
    const student = getStudent(kwt.nama);
    const si = appState.students.findIndex(s => s.nama === kwt.nama);
    const fmt = n => Number(n||0).toLocaleString('id-ID');

    // === 1. Rollback & terapkan koreksi ke data siswa ===
    let sppMonths = [...(appState.students[si]?.spp_paid_months || [])];
    let pangkalPaid = appState.students[si]?.pangkal_paid || 0;
    let kwtItemsBaru = [...items]; // items kuitansi yang akan diperbarui

    const keteranganKoreksi = [];

    koreksiItems.forEach(({ item, idx, aksi, nilaBaru, isPangkal }) => {
      if (aksi === 'batalkan') {
        // Batalkan: hapus dari catatan & kurangi pangkal_paid jika pangkal
        if (item.bulan && sppMonths.includes(item.bulan)) {
          sppMonths = sppMonths.filter(m => m !== item.bulan);
          keteranganKoreksi.push(`SPP ${MONTH_FULL[item.bulan]||item.bulan} dibatalkan`);
        }
        if (isPangkal) {
          keteranganKoreksi.push(`Pangkal Rp ${fmt(item.amount)} dibatalkan`);
          pangkalPaid = Math.max(0, pangkalPaid - item.amount);
        }
        kwtItemsBaru[idx] = { ...item, amount: item.amount, _dibatalkan: true };

      } else if (aksi === 'koreksi_nilai') {
        // Koreksi nilai: update nominal
        const selisih = nilaBaru - item.amount;
        keteranganKoreksi.push(`${item.name}${item.bulan?' ('+(MONTH_FULL[item.bulan]||item.bulan)+')':''}: Rp ${fmt(item.amount)} → Rp ${fmt(nilaBaru)}`);
        if (isPangkal) {
          // Sesuaikan pangkal_paid dengan selisih
          pangkalPaid = Math.max(0, pangkalPaid + selisih);
        }
        kwtItemsBaru[idx] = { ...item, amount: nilaBaru, _koreksi: true };
      }
    });

    // Update data siswa di appState & Supabase
    if (si >= 0) {
      appState.students[si].spp_paid_months = sppMonths;
      appState.students[si].pangkal_paid    = pangkalPaid;
    }
    await sb('students?nama=eq.' + encodeURIComponent(kwt.nama),
      'PATCH', { spp_paid_months: sppMonths, pangkal_paid: pangkalPaid }, { 'Prefer': 'return=minimal' });

    // === 2. Buat kuitansi koreksi baru ===
    const noKoreksi = await generateNoKuitansi();
    const catatanKoreksi = (catatan ? catatan + ' · ' : '') + 'Koreksi atas ' + kwt.no_kuitansi + ': ' + keteranganKoreksi.join('; ');
    const itemsKoreksi = koreksiItems.map(({ item, aksi, nilaBaru }) => ({
      name: item.name + (item.bulan ? ' (' + (MONTH_FULL[item.bulan]||item.bulan) + ')' : ''),
      amount: aksi === 'batalkan' ? item.amount : nilaBaru,
      bulan: item.bulan || null,
      _tipe: aksi,
      _dibatalkan: aksi === 'batalkan',
      _koreksi: aksi === 'koreksi_nilai',
    }));
    const totalKoreksi = itemsKoreksi.reduce((s, i) => s + i.amount, 0);

    const resKoreksi = await sb('kuitansi', 'POST', {
      no_kuitansi: noKoreksi,
      nama: kwt.nama, kelas: kwt.kelas, nisn: kwt.nisn || '',
      items: itemsKoreksi,
      total: totalKoreksi,
      catatan: catatanKoreksi,
      is_koreksi: true,
      ref_no_kuitansi: kwt.no_kuitansi,
      dicetak: false,
    }, { 'Prefer': 'return=representation' });

    // === 3. Tandai kuitansi lama sebagai "dikoreksi" ===
    await sb('kuitansi?id=eq.' + kwt.id, 'PATCH', {
      dikoreksi_oleh: noKoreksi,
    }, { 'Prefer': 'return=minimal' });

    // === 4. Refresh & cetak kuitansi koreksi ===
    // (siswa sudah di-PATCH langsung ke Supabase)
    renderSiswaTable();
    renderTunggakan();
    renderDashboard();

    switchInputTab('bayar');
    toast('✅ Koreksi berhasil! Kuitansi koreksi ' + noKoreksi + ' dibuat.');

    // Tawarkan cetak kuitansi koreksi
    const kwtKoreksi = resKoreksi?.[0] || { no_kuitansi: noKoreksi, nama: kwt.nama, items: itemsKoreksi, total: totalKoreksi, catatan: catatanKoreksi, is_koreksi: true, ref_no_kuitansi: kwt.no_kuitansi };
    setTimeout(() => {
      pendingKwtData = { ...kwtKoreksi, time: new Date().toLocaleDateString('id-ID') + ' ' + new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) };
      pendingKwtId = resKoreksi?.[0]?.id || null;
      document.getElementById('modalCetakNama').textContent = kwt.nama + ' — Koreksi';
      document.getElementById('modalCetakTotal').textContent = 'Koreksi ' + kwt.no_kuitansi;
      document.getElementById('modalCetakKwt').style.display = 'flex';
    }, 300);

  } catch(e) {
    toast('⚠️ Gagal koreksi: ' + e.message);
    showKoreksiInlineStep(3);
  }
}

// ══════════════════════════════════════════
