// ── SiPay · Koreksi Pembayaran ──
// AI CATATAN — Analisa bukti transfer → isi catatan
// ══════════════════════════════════════════

// ── Buka koreksi untuk satu kuitansi (dipicu dari menu Riwayat Kuitansi) ──
function openKoreksiKwt(id) {
  koreksiSelectedKwt = null;
  const cat = document.getElementById('koreksiCatatan');
  if (cat) cat.value = '';
  const ld = document.getElementById('koreksiLoading');
  if (ld) ld.style.display = 'none';
  const list = document.getElementById('koreksiItemList');
  if (list) list.innerHTML = '<div class="text-center text-muted p-16">Memuat...</div>';
  const ref = document.getElementById('koreksiRefLabel');
  if (ref) ref.textContent = '—';
  document.getElementById('koreksiModal').classList.add('open');
  selectKoreksiKwt(id);
}
function closeKoreksiModal() {
  document.getElementById('koreksiModal').classList.remove('open');
}
// Kompat: tak ada lagi langkah inline (kini modal). Cukup pastikan loading tertutup.
function showKoreksiInlineStep() {
  const ld = document.getElementById('koreksiLoading');
  if (ld) ld.style.display = 'none';
}

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
  if (!list.length) { dd.innerHTML = `<div class="p-12-16 fs-13 text-muted">Tidak ditemukan</div>`; dd.style.display='block'; return; }
  dd.innerHTML = list.slice(0,12).map((s,i) => `
    <div class="koreksi-nama-item p-10-16 pointer border-b-1-border fs-13" data-idx="${i}" data-nama="${esc(s.nama)}"
      onmousedown="selectKoreksiNama('${escJs(s.nama)}')"
      onmouseenter="this.style.background='var(--primary-pale)'" onmouseleave="this.style.background=''"
     >
      <div class="fw-600">${esc(s.nama)}</div>
      <div class="hint">${esc(s.status_kelulusan ? kelasLabel(s) : 'Kelas ' + s.kelas)}${s.nisn?' · NISN '+esc(s.nisn):''}</div>
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
  listEl.innerHTML = '<div class="text-center text-muted p-16">Memuat...</div>';
  showKoreksiInlineStep(2);
  try {
    const rows = await sb('kuitansi?select=*&nama=eq.' + encodeURIComponent(nama) + '&is_koreksi=eq.false&order=created_at.desc&limit=20');
    if (!rows.length) { listEl.innerHTML = '<div class="text-center text-muted p-16 fs-13">Tidak ada kuitansi ditemukan.</div>'; return; }
    const fmt = n => Number(n||0).toLocaleString('id-ID');
    listEl.innerHTML = rows.map(r => {
      const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
      const sudahDikoreksi = !!r.dikoreksi_oleh;
      return `<div class="kwt-pick${sudahDikoreksi ? ' is-done' : ''}" onclick="${sudahDikoreksi ? '' : `selectKoreksiKwt('${r.id}')`}">
        <div class="flex justify-between items-center">
          <div>
            <div class="fw-700 fs-13 text-primary">${esc(r.no_kuitansi||'—')}</div>
            <div class="hint mt-2">${tgl} · TA ${esc(r.ta_label||'—')}</div>
          </div>
          <div class="text-right">
            <div class="fw-700 fs-14">Rp ${fmt(r.total)}</div>
            ${sudahDikoreksi
              ? `<div class="chip-gray">Sudah dikoreksi</div>`
              : `<div class="fs-12 text-primary-light">Klik untuk pilih →</div>`}
          </div>
        </div>
        ${r.catatan ? `<div class="meta-666"><svg class="ic"><use href="#i-msg"/></svg> ${esc(r.catatan)}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div class="text-danger p-16 fs-13">Gagal: ${e.message}</div>`;
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
      `Kuitansi: <strong>${esc(kwt.no_kuitansi)}</strong> · Rp ${fmt(kwt.total)} · TA ${esc(kwt.ta_label||'—')}`;

    // Render item-item kuitansi sebagai checklist koreksi
    const items = Array.isArray(kwt.items) ? kwt.items : [];
    const student = getStudent(kwt.nama);

    document.getElementById('koreksiItemList').innerHTML = items.map((item, i) => {
      const isPangkal = item.name?.toLowerCase().includes('pangkal');
      const pangkalPaidSekarang = student ? pangkalTunggakan(student) === 0 
        ? (student.pangkal||0) 
        : (student.pangkal_paid||0) : 0;
      return `<div class="koreksi-card">
        <label class="flex items-start gap-10 pointer">
          <input class="mt-3 w-16 h-16 accent-primary pointer" type="checkbox" id="koreksiChk_${i}" data-idx="${i}" onchange="toggleKoreksiItem(${i})">
          <div class="flex-1">
            <div class="fw-600 fs-13">${esc(item.name)}${item.bulan?' ('+esc(MONTH_FULL[item.bulan]||item.bulan)+')':''}</div>
            <div class="hint">Nilai tercatat di kuitansi: <strong>Rp ${fmt(item.amount)}</strong></div>
            ${isPangkal ? `<div class="meta-888">Total pangkal dibayar saat ini: Rp ${fmt(pangkalPaidSekarang)} dari Rp ${fmt(student?.pangkal||0)}</div>` : ''}
          </div>
        </label>
        <!-- Input nilai koreksi (muncul saat dicentang) -->
        <div class="koreksi-input" id="koreksiInput_${i}" hidden>
          <div class="fs-12 fw-600 mb-6 text-muted">Pilih Tindakan</div>
          <select class="w-full p-8-12 border-2-primary-light rounded-8 fs-13 font-inherit outline-none mb-8" id="koreksiAksi_${i}">
            <option value="batalkan">Batalkan item ini (pembayaran dianggap tidak terjadi)</option>
            <option value="koreksi_nilai">Koreksi nilai — ubah nominal yang benar</option>
          </select>
          <input class="w-full p-8-12 border-2-primary-light rounded-8 fs-13 font-inherit outline-none box-border" type="number" id="koreksiVal_${i}" placeholder="Nilai yang benar (Rp)..." value="${item.amount}"
            hidden
            oninput="updateKoreksiTotal()">
          ${isPangkal ? `<div class="koreksi-info" id="koreksiPangkalInfo_${i}" hidden></div>` : ''}
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
              infoEl.innerHTML = '<svg class="ic"><use href="#i-alert"/></svg> Pembayaran pangkal sebesar <strong>Rp ' + fmt(item.amount) + '</strong> akan dikurangi dari total yang tercatat.';
            } else if (aksiEl.value === 'koreksi_nilai') {
              infoEl.style.display = 'block';
              infoEl.innerHTML = '<svg class="ic"><use href="#i-edit"/></svg> Isikan nominal pangkal yang <strong>benar</strong> untuk kuitansi ini. Selisih akan disesuaikan otomatis.';
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

    // === 1. Rollback & terapkan koreksi ke data siswa & tagihan ===
    // Perubahan dicatat sebagai SELISIH, lalu digabungkan ke kondisi terbaru di
    // server — koreksi dari device ini tidak boleh menghapus pembayaran yang
    // sudah diinput dari device lain.
    const sppMonthsLokal = new Set(appState.students[si]?.spp_paid_months || []);
    const sppOps = { cur: [], hist: [] };
    const keteranganKoreksi = [];
    const tagihanUpdates = [];   // { id, delta }

    koreksiItems.forEach(({ item, idx, aksi, nilaBaru }) => {
      if (aksi === 'batalkan') {
        // Angsuran & tunggakan TA lama dibatalkan sebesar nominalnya; bulan
        // lunas biasa tahun berjalan dibatalkan utuh (perilaku lama).
        const op = item.bulan ? sppRevertOp(item, -1) : null;
        if (op && (op.hist || op.cur.delta !== undefined || sppMonthsLokal.has(item.bulan))) {
          if (op.cur)  sppOps.cur.push(op.cur);
          if (op.hist) sppOps.hist.push(op.hist);
          keteranganKoreksi.push(`SPP ${MONTH_FULL[item.bulan]||item.bulan}${item.angsur ? ' (angsur Rp ' + fmt(item.amount) + ')' : ''} dibatalkan`);
        }
        if (item.item_id && item.item_id !== 'spp') {
          const t = findTagihan(kwt.nama, item.item_id);
          if (t) {
            tagihanUpdates.push({ id: t.id, delta: -item.amount });
            keteranganKoreksi.push(`${item.name} Rp ${fmt(item.amount)} dibatalkan`);
          }
        }
      } else if (aksi === 'koreksi_nilai') {
        const selisih = nilaBaru - item.amount;
        keteranganKoreksi.push(`${item.name}${item.bulan?' ('+(MONTH_FULL[item.bulan]||item.bulan)+')':''}: Rp ${fmt(item.amount)} → Rp ${fmt(nilaBaru)}`);
        // SPP berbulan: nominal terbayar bulan itu ikut digeser sebesar selisihnya
        // (mis. angsur 150rb dikoreksi jadi 100rb → bulan itu kurang 50rb lagi).
        if (item.bulan && selisih) {
          const op = sppDeltaOp(item, selisih);
          if (op.cur)  sppOps.cur.push(op.cur);
          if (op.hist) sppOps.hist.push(op.hist);
        }
        if (item.item_id && item.item_id !== 'spp') {
          const t = findTagihan(kwt.nama, item.item_id);
          if (t) tagihanUpdates.push({ id: t.id, delta: selisih });
        }
      }
    });

    // Update SPP months di siswa & Supabase
    if (sppOps.cur.length || sppOps.hist.length) await commitSppOps(kwt.nama, sppOps);
    // Update tagihan paid_amount
    for (const u of tagihanUpdates) {
      await addTagihanPaid(u.id, u.delta);
    }

    // === 2. Buat kuitansi koreksi baru ===
    let noKoreksi = await generateNoKuitansi();
    const catatanKoreksi = (catatan ? catatan + ' · ' : '') + 'Koreksi atas ' + kwt.no_kuitansi + ': ' + keteranganKoreksi.join('; ');
    const itemsKoreksi = koreksiItems.map(({ item, aksi, nilaBaru }) => ({
      name: item.name + (item.bulan ? ' (' + (MONTH_FULL[item.bulan]||item.bulan) + ')' : ''),
      amount: aksi === 'batalkan' ? item.amount : nilaBaru,
      bulan: item.bulan || null,
      // Dibawa agar menghapus kuitansi koreksi ini bisa mengembalikan efeknya
      // ke tempat yang benar (angsuran / tunggakan TA lama).
      ...(item.ta ? { ta: item.ta } : {}),
      ...(item.angsur ? { angsur: true } : {}),
      ...(item.rate ? { rate: item.rate } : {}),
      // Selisih koreksi nilai, dipakai untuk membaliknya bila kuitansi koreksi dihapus.
      ...(aksi === 'koreksi_nilai' && item.bulan ? { selisih: nilaBaru - item.amount } : {}),
      _tipe: aksi,
      _dibatalkan: aksi === 'batalkan',
      _koreksi: aksi === 'koreksi_nilai',
    }));
    const totalKoreksi = itemsKoreksi.reduce((s, i) => s + i.amount, 0);

    const kwtKoreksiData = {
      no_kuitansi: noKoreksi,
      nama: kwt.nama, kelas: kwt.kelas, nisn: kwt.nisn || '',
      items: itemsKoreksi,
      total: totalKoreksi,
      catatan: catatanKoreksi,
      is_koreksi: true,
      ref_no_kuitansi: kwt.no_kuitansi,
      dicetak: false,
      ta_label: getProfil().ta || '',
    };
    const resKoreksi = await insertKuitansi(kwtKoreksiData);
    noKoreksi = kwtKoreksiData.no_kuitansi;   // bisa berganti bila nomornya bentrok

    // === 3. Tandai kuitansi lama sebagai "dikoreksi" ===
    await sb('kuitansi?id=eq.' + kwt.id, 'PATCH', {
      dikoreksi_oleh: noKoreksi,
    }, { 'Prefer': 'return=minimal' });

    // === 4. Refresh & cetak kuitansi koreksi ===
    // (siswa sudah di-PATCH langsung ke Supabase)
    renderSiswaTable(false, true);
    renderTunggakan();
    renderDashboard();

    closeKoreksiModal();
    if (typeof loadRiwayatKuitansi === 'function') loadRiwayatKuitansi();
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
