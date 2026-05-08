// ── SiPay · Kuitansi (Modal, Hapus, Cetak, Riwayat) ──
// RIWAYAT KUITANSI
// ══════════════════════════════════════════
let pendingKwtData = null;
let pendingKwtId   = null;

function tutupModalCetakKwt() {
  document.getElementById('modalCetakKwt').style.display = 'none';
  toast('✅ Pembayaran berhasil disimpan!');
}

async function konfirmasiCetakKwt() {
  document.getElementById('modalCetakKwt').style.display = 'none';
  if (!pendingKwtData) return;
  // Tandai sudah dicetak
  if (pendingKwtId) {
    sb('kuitansi?id=eq.' + pendingKwtId, 'PATCH',
      { dicetak: true, dicetak_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' }).catch(()=>{});
  }
  await cetakKuitansi(pendingKwtData);
  toast('✅ Pembayaran disimpan & kuitansi dicetak!');
}

async function cetakKuitansiById(nama, timeStr) {
  // Cetak ulang dari session table — cari di Supabase dulu
  try {
    const rows = await sb('kuitansi?select=*&nama=eq.' + encodeURIComponent(nama) + '&order=created_at.desc&limit=5');
    // Cari yang waktu cocok (dibuat hari ini sesi ini)
    const match = rows[0];
    if (match) {
      // Tandai dicetak
      sb('kuitansi?id=eq.' + match.id, 'PATCH',
        { dicetak: true, dicetak_at: new Date().toISOString() },
        { 'Prefer': 'return=minimal' }).catch(()=>{});
      await cetakKuitansi({ ...match, time: timeStr || match.created_at });
      return;
    }
  } catch {}
  // Fallback ke pendingKwtData
  if (pendingKwtData && pendingKwtData.nama === nama) {
    await cetakKuitansi(pendingKwtData);
  }
}

async function cetakKuitansiFromRiwayat(id) {
  try {
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const r = rows[0];
    // Tandai dicetak
    sb('kuitansi?id=eq.' + id, 'PATCH',
      { dicetak: true, dicetak_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' }).catch(()=>{});
    const timeStr = r.created_at
      ? new Date(r.created_at).toLocaleDateString('id-ID') + ' ' + new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})
      : '—';
    await cetakKuitansi({ ...r, time: timeStr });
    // Refresh tabel
    loadRiwayatKuitansi();
  } catch(e) { toast('⚠️ Gagal: ' + e.message); }
}

let _pendingHapusKwtId = null;

function tutupModalHapusKwt() {
  document.getElementById('modalHapusKwt').style.display = 'none';
  _pendingHapusKwtId = null;
}

async function hapusKuitansi(id) {
  // Ambil data kuitansi untuk ditampilkan di modal
  try {
    const rows = await sb('kuitansi?select=no_kuitansi,nama,total,ta_label,created_at&id=eq.' + id);
    if (rows.length) {
      const r = rows[0];
      const fmt = n => Number(n||0).toLocaleString('id-ID');
      const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : '—';
      document.getElementById('modalHapusKwtNama').textContent = r.nama || '—';
      document.getElementById('modalHapusKwtDetail').innerHTML =
        `${r.no_kuitansi || '—'} &nbsp;·&nbsp; Rp ${fmt(r.total)} &nbsp;·&nbsp; TA ${r.ta_label || '—'}<br>
         <span style="font-size:11px;color:#999;">${tgl}</span>`;
    } else {
      document.getElementById('modalHapusKwtNama').textContent = 'Data Kuitansi';
      document.getElementById('modalHapusKwtDetail').textContent = '—';
    }
  } catch {
    document.getElementById('modalHapusKwtNama').textContent = 'Data Kuitansi';
    document.getElementById('modalHapusKwtDetail').textContent = id;
  }
  _pendingHapusKwtId = id;
  document.getElementById('modalHapusKwt').style.display = 'flex';
}

async function konfirmasiHapusKwt() {
  const id = _pendingHapusKwtId;
  if (!id) return;

  const btn = document.getElementById('modalHapusKwtConfirmBtn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Menghapus...';

  try {
    // 1. Ambil data kuitansi koreksi lengkap
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const kwt = rows[0];

    // Hanya boleh hapus kuitansi koreksi (is_koreksi=true)
    if (!kwt.is_koreksi) { toast('⚠️ Hanya kuitansi koreksi yang dapat dihapus'); return; }

    // 2. Balik efek koreksi ke data siswa
    if (kwt.nama && kwt.items?.length) {
      const siswaRows = await sb('students?select=*&nama=eq.' + encodeURIComponent(kwt.nama));
      if (siswaRows.length) {
        const s = siswaRows[0];
        let sppMonths  = Array.isArray(s.spp_paid_months) ? [...s.spp_paid_months] : [];
        let pangkalPaid = Number(s.pangkal_paid) || 0;
        let changed = false;

        kwt.items.forEach(item => {
          const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
          const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';
          const isPangkal  = item.name?.toLowerCase().includes('pangkal');

          if (dibatalkan) {
            // Item dibatalkan saat koreksi → kembalikan
            if (item.bulan && !sppMonths.includes(item.bulan)) {
              sppMonths.push(item.bulan);
              changed = true;
            }
            if (isPangkal && item.amount > 0) {
              pangkalPaid += item.amount;
              changed = true;
            }
          } else if (dikoreksi) {
            // Nilai dikoreksi → kembalikan selisih
            // Nilai lama bisa dilihat dari ref_kuitansi tapi cukup kurangi amount baru
            if (isPangkal && item.amount > 0) {
              pangkalPaid = Math.max(0, pangkalPaid - item.amount);
              changed = true;
            }
          }
        });

        if (changed) {
          await sb(
            'students?nama=eq.' + encodeURIComponent(kwt.nama),
            'PATCH',
            { spp_paid_months: sppMonths, pangkal_paid: pangkalPaid },
            { 'Prefer': 'return=minimal' }
          );
          const si = appState.students.findIndex(s => s.nama === kwt.nama);
          if (si >= 0) {
            appState.students[si].spp_paid_months = sppMonths;
            appState.students[si].pangkal_paid    = pangkalPaid;
          }
          const ai = allStudentsAllTA.findIndex(r => r.nama === kwt.nama);
          if (ai >= 0) {
            allStudentsAllTA[ai].spp_paid_months = sppMonths;
            allStudentsAllTA[ai].pangkal_paid    = pangkalPaid;
          }
        }
      }

      // 3. Hapus tanda "dikoreksi" dari kuitansi lama yang direferensikan
      if (kwt.ref_no_kuitansi) {
        await sb(
          'kuitansi?no_kuitansi=eq.' + encodeURIComponent(kwt.ref_no_kuitansi),
          'PATCH',
          { dikoreksi_oleh: null },
          { 'Prefer': 'return=minimal' }
        ).catch(() => {});
      }
    }

    // 4. Hapus kuitansi koreksi
    await sb('kuitansi?id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });

    tutupModalHapusKwt();
    toast('🗑️ Kuitansi koreksi dihapus & data pembayaran dikembalikan');
    loadRiwayatKuitansi();
    renderDashboard(); renderSiswaTable(); renderTunggakan();

  } catch(e) {
    toast('⚠️ Gagal: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🗑️ Ya, Hapus';
  }
}

async function loadRiwayatKuitansi() {
  const el = document.getElementById('kwtTableWrap');
  const statsEl = document.getElementById('kwtStats');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Memuat...</div>';

  const q       = document.getElementById('kwt_search')?.value?.trim().toLowerCase() || '';
  const dari    = document.getElementById('kwt_dari')?.value || '';
  const sampai  = document.getElementById('kwt_sampai')?.value || '';

  try {
    // Query semua kuitansi tanpa filter TA — ambil dari semua TA
    let url = 'kuitansi?select=*&order=created_at.desc&limit=500';
    if (dari)   url += '&created_at=gte.' + dari + 'T00:00:00';
    if (sampai) url += '&created_at=lte.' + sampai + 'T23:59:59';
  let rows = await sb(url);

    // Filter nama / no kuitansi di client
    if (q) rows = rows.filter(r =>
      r.nama?.toLowerCase().includes(q) ||
      r.no_kuitansi?.toLowerCase().includes(q) ||
      r.ta_label?.toLowerCase().includes(q)
    );

    // Stats
    const totalNominal = rows.reduce((s,r) => s + (r.total||0), 0);
    const sudahCetak   = rows.filter(r => r.dicetak).length;
    // Hitung jumlah TA unik
    if (statsEl) statsEl.innerHTML = `
      <div class="stat-card blue"><div class="stat-label">Total Kuitansi</div><div class="stat-value" style="font-size:22px;">${rows.length}</div><div class="stat-sub">${taUnik} tahun ajaran</div><div class="stat-icon">🧾</div></div>
      <div class="stat-card green"><div class="stat-label">Total Nominal</div><div class="stat-value" style="font-size:18px;">${rp(totalNominal)}</div><div class="stat-sub">Semua TA tergabung</div><div class="stat-icon">💰</div></div>
      <div class="stat-card gold"><div class="stat-label">Sudah Dicetak</div><div class="stat-value" style="font-size:22px;">${sudahCetak}</div><div class="stat-sub">${rows.length - sudahCetak} belum dicetak</div><div class="stat-icon">🖨️</div></div>
    `;

    if (!rows.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:32px;font-size:13px;">Tidak ada data kuitansi.</div>';
      return;
    }

    const fmt = n => Number(n||0).toLocaleString('id-ID');
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>No. Kuitansi</th>
            <th>Tanggal</th>
            <th>Nama Santri</th>
            <th>Kelas</th>
            <th>TA</th>
            <th>Rincian</th>
            <th style="text-align:right;">Total</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
              const jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '';
              const items = Array.isArray(r.items) ? r.items.map(i => i.name + (i.bulan?' ('+( MONTH_FULL[i.bulan]||i.bulan)+')':'')).join(', ') : '—';
              const statusBadge = r.dikoreksi_oleh
                ? `<span style="background:#fef9c3;color:#92400e;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">🔄 Dikoreksi</span><br><span style="font-size:10px;color:#999;">${r.dikoreksi_oleh}</span>`
                : r.is_koreksi
                ? `<span style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">📋 Kuitansi Koreksi</span><br><span style="font-size:10px;color:#999;">Ref: ${r.ref_no_kuitansi||'—'}</span>`
                : r.dicetak
                ? `<span style="background:#dcfce7;color:#166534;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">✅ Dicetak</span>`
                : `<span style="background:#fef9c3;color:#854d0e;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">⏳ Belum</span>`;
              return `<tr>
                <td style="font-weight:700;font-size:12px;color:var(--primary);">${r.no_kuitansi||'—'}</td>
                <td style="font-size:12px;">${tgl}<br><span style="color:var(--text-muted);font-size:11px;">${jam}</span></td>
                <td><strong>${r.nama}</strong></td>
                <td>${r.kelas||'—'}</td>
                <td><span style="background:var(--primary-pale);color:var(--primary);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">${r.ta_label||'—'}</span></td>
                <td style="font-size:12px;max-width:180px;white-space:normal;">${items}</td>
                <td style="text-align:right;font-weight:700;color:var(--primary-light);">Rp ${fmt(r.total)}</td>
                <td>${statusBadge}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-primary btn-sm" onclick="cetakKuitansiFromRiwayat('${r.id}')" title="Cetak ulang">🖨️</button>
                  ${r.is_koreksi ? `<button class="btn btn-danger btn-sm" onclick="hapusKuitansi('${r.id}')" title="Hapus kuitansi koreksi">🗑️</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);padding:16px;">Gagal: ${e.message}</div>`;
  }
}

function resetFilterKwt() {
  document.getElementById('kwt_search').value  = '';
  document.getElementById('kwt_dari').value    = '';
  document.getElementById('kwt_sampai').value  = '';
  const selTA = document.getElementById('kwt_ta');
  if (selTA) selTA.value = '';
  loadRiwayatKuitansi();
}

// ══════════════════════════════════════════
