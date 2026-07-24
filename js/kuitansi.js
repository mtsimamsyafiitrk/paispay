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
        `${esc(r.no_kuitansi || '—')} &nbsp;·&nbsp; Rp ${fmt(r.total)} &nbsp;·&nbsp; TA ${esc(r.ta_label || '—')}<br>
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
    // 1. Ambil data kuitansi
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const kwt = rows[0];

    // 2. Balik efek pembayaran ke data siswa & tagihan
    if (kwt.nama && kwt.items?.length) {
      const si = appState.students.findIndex(s => s.nama === kwt.nama);
      let sppMonths = si >= 0 ? [...(appState.students[si].spp_paid_months || [])] : [];
      let sppChanged = false;

      for (const item of kwt.items) {
        const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
        const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';

        if (kwt.is_koreksi) {
          // Kuitansi koreksi: balik efek koreksi
          if (dibatalkan) {
            if (item.bulan && !sppMonths.includes(item.bulan)) { sppMonths.push(item.bulan); sppChanged = true; }
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await updateTagihanPaid(t.id, t.paid_amount + item.amount);
            }
          } else if (dikoreksi) {
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await updateTagihanPaid(t.id, Math.max(0, t.paid_amount - item.amount));
            }
          }
        } else {
          // Kuitansi biasa: kurangi pembayaran
          if (item.bulan) {
            sppMonths = sppMonths.filter(m => m !== item.bulan);
            sppChanged = true;
          } else if (item.item_id && item.item_id !== 'spp') {
            const t = findTagihan(kwt.nama, item.item_id);
            if (t) await updateTagihanPaid(t.id, Math.max(0, t.paid_amount - item.amount));
          }
        }
      }

      if (sppChanged && si >= 0) {
        appState.students[si].spp_paid_months = sppMonths;
        await sb('students?nama=eq.' + encodeURIComponent(kwt.nama),
          'PATCH', { spp_paid_months: sppMonths }, { 'Prefer': 'return=minimal' });
      }

      // Hapus tanda "dikoreksi" dari kuitansi lama jika ini kuitansi koreksi
      if (kwt.is_koreksi && kwt.ref_no_kuitansi) {
        await sb('kuitansi?no_kuitansi=eq.' + encodeURIComponent(kwt.ref_no_kuitansi),
          'PATCH', { dikoreksi_oleh: null }, { 'Prefer': 'return=minimal' }).catch(() => {});
      }
    }

    // 3. Hapus kuitansi
    await sb('kuitansi?id=eq.' + id, 'DELETE', null, { 'Prefer': 'return=minimal' });

    tutupModalHapusKwt();
    toast('🗑️ Kuitansi dihapus & data pembayaran dikembalikan');
    loadRiwayatKuitansi();
    renderDashboard(); renderSiswaTable(); renderTunggakan();

  } catch(e) {
    toast('⚠️ Gagal: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🗑️ Ya, Hapus';
  }
}

// ── Riwayat Kuitansi: pencarian di sisi server + paginasi ──
// Dulu hanya menarik 500 baris lalu menyaring di klien — tak cukup untuk
// arsip besar (mis. ribuan entri Buku Induk). Kini filter & pencarian
// dikirim ke server, dan hasilnya dipaginasi.
let kwtPage = 0;
const KWT_PAGE_SIZE = 100;
function kwtNextPage() { kwtPage++; loadRiwayatKuitansi(true); }
function kwtPrevPage() { if (kwtPage > 0) { kwtPage--; loadRiwayatKuitansi(true); } }

// Susun bagian filter PostgREST (dipakai untuk ambil data & hitung total).
function kwtBuildFilters() {
  const q      = document.getElementById('kwt_search')?.value?.trim() || '';
  const ta     = document.getElementById('kwt_ta')?.value || '';
  const dari   = document.getElementById('kwt_dari')?.value || '';
  const sampai = document.getElementById('kwt_sampai')?.value || '';
  const f = [];
  if (q) {
    const v = encodeURIComponent('*' + q + '*');   // ilike wildcard PostgREST
    f.push(`or=(nama.ilike.${v},no_kuitansi.ilike.${v},ta_label.ilike.${v})`);
  }
  if (ta)     f.push('ta_label=eq.' + encodeURIComponent(ta));
  if (dari)   f.push('created_at=gte.' + dari + 'T00:00:00');
  if (sampai) f.push('created_at=lte.' + sampai + 'T23:59:59');
  return f;
}
// Hitung total baris yang cocok (best-effort lewat header Content-Range).
async function kwtCountTotal(filters) {
  try {
    const qs = ['select=id'].concat(filters).join('&');
    const r = await fetch(SB_URL + '/rest/v1/kuitansi?' + qs, {
      headers: { ...authHeaders(), 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
    });
    const cr = r.headers.get('content-range') || '';
    return parseInt(cr.split('/')[1]);
  } catch { return NaN; }
}

async function loadRiwayatKuitansi(keepPage) {
  if (!keepPage) kwtPage = 0;
  const el = document.getElementById('kwtTableWrap');
  const statsEl = document.getElementById('kwtStats');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Memuat...</div>';

  const filters = kwtBuildFilters();

  try {
    const offset = kwtPage * KWT_PAGE_SIZE;
    const url = ['kuitansi?select=*', 'order=created_at.desc']
      .concat(filters)
      .concat(['limit=' + KWT_PAGE_SIZE, 'offset=' + offset]).join('&');
    let rows = await sb(url);
    const total = await kwtCountTotal(filters);              // bisa NaN bila gagal
    const known = Number.isFinite(total);
    const totalPages = known ? Math.max(1, Math.ceil(total / KWT_PAGE_SIZE))
                             : kwtPage + (rows.length === KWT_PAGE_SIZE ? 2 : 1);
    const hasNext = known ? (kwtPage + 1 < totalPages) : (rows.length === KWT_PAGE_SIZE);

    // Stats (Total dari server; nominal & cetak dihitung untuk halaman ini)
    const nominalHal = rows.reduce((s,r) => s + (r.total||0), 0);
    const sudahCetak = rows.filter(r => r.dicetak).length;
    if (statsEl) statsEl.innerHTML = `
      <div class="stat-card blue"><div class="stat-label">Total Kuitansi</div><div class="stat-value" style="font-size:22px;">${known ? total : '—'}</div><div class="stat-sub">${filters.length ? 'sesuai filter' : 'semua data'}</div><div class="stat-icon">🧾</div></div>
      <div class="stat-card green"><div class="stat-label">Nominal (halaman ini)</div><div class="stat-value" style="font-size:18px;">${rp(nominalHal)}</div><div class="stat-sub">${rows.length} baris ditampilkan</div><div class="stat-icon">💰</div></div>
      <div class="stat-card gold"><div class="stat-label">Halaman</div><div class="stat-value" style="font-size:22px;">${kwtPage + 1}<span style="font-size:13px;font-weight:500;"> / ${totalPages}</span></div><div class="stat-sub">${KWT_PAGE_SIZE} per halaman</div><div class="stat-icon">📄</div></div>
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
              const isInduk = typeof isIndukKwt === 'function' && isIndukKwt(r);
              const isIncomplete = typeof indukIncomplete === 'function' && indukIncomplete(r);
              const indukBadges = `${isInduk?'<br><span style="background:var(--primary-pale);color:var(--primary);border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;">📖 Buku Induk</span>':''}${isIncomplete?`<br><span title="Data tidak lengkap" style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;">⚠️ Tidak lengkap</span>`:''}`;
              const statusBadge = r.dikoreksi_oleh
                ? `<span style="background:#fef9c3;color:#92400e;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">🔄 Dikoreksi</span><br><span style="font-size:10px;color:#999;">${esc(r.dikoreksi_oleh)}</span>`
                : r.is_koreksi
                ? `<span style="background:#fef3c7;color:#b45309;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">📋 Kuitansi Koreksi</span><br><span style="font-size:10px;color:#999;">Ref: ${esc(r.ref_no_kuitansi||'—')}</span>`
                : r.dicetak
                ? `<span style="background:#dcfce7;color:#166534;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">✅ Dicetak</span>`
                : `<span style="background:#fef9c3;color:#854d0e;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">⏳ Belum</span>`;
              return `<tr>
                <td style="font-weight:700;font-size:12px;color:var(--primary);">${esc(r.no_kuitansi||'—')}</td>
                <td style="font-size:12px;">${tgl}<br><span style="color:var(--text-muted);font-size:11px;">${jam}</span></td>
                <td><strong>${esc(r.nama)}</strong></td>
                <td>${esc(r.kelas||'—')}</td>
                <td><span style="background:var(--primary-pale);color:var(--primary);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;">${esc(r.ta_label||'—')}</span></td>
                <td style="font-size:12px;max-width:180px;white-space:normal;">${esc(items)}</td>
                <td style="text-align:right;font-weight:700;color:var(--primary-light);">Rp ${fmt(r.total)}</td>
                <td>${statusBadge}${indukBadges}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-outline btn-sm" onclick="openIndukDetail('${r.id}')" title="Lihat detail">🔍</button>
                  <button class="btn btn-primary btn-sm" onclick="cetakKuitansiFromRiwayat('${r.id}')" title="Cetak ulang">🖨️</button>
                  ${(!r.dikoreksi_oleh && !r.is_koreksi) ? `<button class="btn btn-outline btn-sm" onclick="openKoreksiKwt('${r.id}')" title="Edit / koreksi kuitansi">✏️</button>` : ''}
                  ${!r.dikoreksi_oleh ? `<button class="btn btn-danger btn-sm" onclick="hapusKuitansi('${r.id}')" title="Hapus kuitansi">🗑️</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" ${kwtPage <= 0 ? 'disabled' : ''} onclick="kwtPrevPage()">← Sebelumnya</button>
        <span style="font-size:13px;color:var(--text-muted);">Halaman <strong>${kwtPage + 1}</strong> dari ${totalPages}</span>
        <button class="btn btn-outline btn-sm" ${hasNext ? '' : 'disabled'} onclick="kwtNextPage()">Berikutnya →</button>
      </div>`;
  } catch(e) {
    el.innerHTML = `
      <div style="padding:24px;text-align:center;">
        <div style="font-size:32px;margin-bottom:12px;">⚠️</div>
        <div style="font-weight:700;font-size:15px;color:var(--danger);margin-bottom:8px;">Gagal Memuat Riwayat Kuitansi</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Terjadi kesalahan saat mengambil data dari server.</div>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 16px;font-size:12px;color:#856404;text-align:left;margin-bottom:16px;max-width:480px;margin-left:auto;margin-right:auto;">
          <strong>Detail error:</strong><br>${e.message || 'Koneksi ke Supabase gagal. Periksa koneksi internet Anda.'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="loadRiwayatKuitansi()">🔄 Coba Lagi</button>
      </div>`;
    if (statsEl) statsEl.innerHTML = '';
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
