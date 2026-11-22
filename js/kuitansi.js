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
      await cetakKuitansi({ ...match, time: match.tgl_bayar || timeStr || match.created_at });
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
    const timeStr = r.tgl_bayar || (r.created_at
      ? new Date(r.created_at).toLocaleDateString('id-ID') + ' ' + new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})
      : '—');
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
         <span class="meta-999">${tgl}</span>`;
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
  btn.innerHTML = '<svg class="ic"><use href="#i-clock"/></svg> Menghapus...';

  try {
    // 1. Ambil data kuitansi
    const rows = await sb('kuitansi?select=*&id=eq.' + id);
    if (!rows.length) { toast('⚠️ Data tidak ditemukan'); return; }
    const kwt = rows[0];

    // 2. Balik efek pembayaran ke data siswa & tagihan
    // Perubahan dikumpulkan sebagai SELISIH lalu digabungkan ke kondisi terbaru
    // di server — supaya pembayaran yang diinput dari device lain sesudah
    // kuitansi ini dibuat tidak ikut terhapus.
    if (kwt.nama && kwt.items?.length) {
      const ops = { cur: [], hist: [] };
      const pushOp = (o) => { if (o) { if (o.cur) ops.cur.push(o.cur); if (o.hist) ops.hist.push(o.hist); } };

      for (const item of kwt.items) {
        const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
        const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';

        if (kwt.is_koreksi) {
          // Kuitansi koreksi: balik efek koreksi
          if (dibatalkan) {
            if (item.bulan) pushOp(sppRevertOp(item, +1));
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await addTagihanPaid(t.id, item.amount);
            }
          } else if (dikoreksi) {
            if (item.bulan && item.selisih) pushOp(sppDeltaOp(item, -item.selisih));
            if (item.item_id && item.item_id !== 'spp') {
              const t = findTagihan(kwt.nama, item.item_id);
              if (t) await addTagihanPaid(t.id, -item.amount);
            }
          }
        } else {
          // Kuitansi biasa: kurangi pembayaran
          if (item.bulan) {
            pushOp(sppRevertOp(item, -1));
          } else if (item.item_id && item.item_id !== 'spp') {
            const t = findTagihan(kwt.nama, item.item_id);
            if (t) await addTagihanPaid(t.id, -item.amount);
          }
        }
      }

      if (ops.cur.length || ops.hist.length) {
        await commitSppOps(kwt.nama, ops);
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
    btn.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg> Ya, Hapus';
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
  el.innerHTML = '<div class="text-center text-muted p-24">Memuat...</div>';

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
      <div class="stat-card blue"><div class="stat-label">Total Kuitansi</div><div class="stat-value fs-22">${known ? total : '—'}</div><div class="stat-sub">${filters.length ? 'sesuai filter' : 'semua data'}</div><div class="stat-icon"><svg class="ic"><use href="#i-file"/></svg></div></div>
      <div class="stat-card green"><div class="stat-label">Nominal (halaman ini)</div><div class="stat-value fs-18">${rp(nominalHal)}</div><div class="stat-sub">${rows.length} baris ditampilkan</div><div class="stat-icon"><svg class="ic"><use href="#i-cash"/></svg></div></div>
      <div class="stat-card gold"><div class="stat-label">Halaman</div><div class="stat-value fs-22">${kwtPage + 1}<span class="fs-13 fw-500"> / ${totalPages}</span></div><div class="stat-sub">${KWT_PAGE_SIZE} per halaman</div><div class="stat-icon"><svg class="ic"><use href="#i-file"/></svg></div></div>
    `;

    if (!rows.length) {
      el.innerHTML = '<div class="text-center text-muted p-32 fs-13">Tidak ada data kuitansi.</div>';
      return;
    }

    const fmt = n => Number(n||0).toLocaleString('id-ID');
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table" id="kwtTable">
          <thead><tr>
            <th>No. Kuitansi</th>
            <th>Tanggal</th>
            <th>Nama Santri</th>
            <th>Kelas</th>
            <th>TA</th>
            <th>Rincian</th>
            <th class="text-right">Total</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              // Utamakan tanggal pembayaran yang dipilih admin (tgl_bayar), fallback created_at
              let tgl, jam;
              if (r.tgl_bayar) {
                const parts = String(r.tgl_bayar).split(' ');
                tgl = parts[0] || '—';
                jam = parts[1] || '';
              } else {
                tgl = r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
                jam = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '';
              }
              const items = Array.isArray(r.items) ? r.items.map(i => i.name + (i.bulan?' ('+( MONTH_FULL[i.bulan]||i.bulan)+')':'')).join(', ') : '—';
              const isInduk = typeof isIndukKwt === 'function' && isIndukKwt(r);
              const isIncomplete = typeof indukIncomplete === 'function' && indukIncomplete(r);
              const indukBadges = `${isInduk?'<br><span class="bg-primary-pale text-primary rounded-20 p-2-8 fs-12 fw-700"><svg class="ic"><use href="#i-book"/></svg> Buku Induk</span>':''}${isIncomplete?`<br><span class="pill-sm-warn" title="Data tidak lengkap"><svg class="ic"><use href="#i-alert"/></svg> Tidak lengkap</span>`:''}`;
              const statusBadge = r.dikoreksi_oleh
                ? `<span class="pill pill-koreksi"><svg class="ic"><use href="#i-refresh"/></svg> Dikoreksi</span><br><span class="meta-999">${esc(r.dikoreksi_oleh)}</span>`
                : r.is_koreksi
                ? `<span class="pill pill-warn"><svg class="ic"><use href="#i-clip"/></svg> Kuitansi Koreksi</span><br><span class="meta-999">Ref: ${esc(r.ref_no_kuitansi||'—')}</span>`
                : r.dicetak
                ? `<span class="pill pill-ok"><svg class="ic"><use href="#i-check"/></svg> Dicetak</span>`
                : `<span class="pill pill-belum"><svg class="ic"><use href="#i-clock"/></svg> Belum</span>`;
              return `<tr>
                <td class="fw-700 fs-12 text-primary">${esc(r.no_kuitansi||'—')}</td>
                <td class="fs-12">${tgl}<br><span class="hint">${jam}</span></td>
                <td><strong>${esc(r.nama)}</strong></td>
                <td>${esc(r.kelas||'—')}</td>
                <td><span class="tag-primary">${esc(r.ta_label||'—')}</span></td>
                <td class="cell-rincian">${esc(items)}</td>
                <td class="text-right fw-700 text-primary-light">Rp ${fmt(r.total)}</td>
                <td>${statusBadge}${indukBadges}</td>
                <td class="nowrap">
                  <button class="btn btn-outline btn-sm" onclick="openIndukDetail('${r.id}')" title="Lihat detail"><svg class="ic"><use href="#i-search"/></svg> Detail</button>
                  <button class="btn btn-primary btn-sm" onclick="cetakKuitansiFromRiwayat('${r.id}')" title="Cetak ulang"><svg class="ic"><use href="#i-print"/></svg> Cetak</button>
                  ${(!r.dikoreksi_oleh && !r.is_koreksi) ? `<button class="btn btn-outline btn-sm" onclick="openKoreksiKwt('${r.id}')" title="Edit / koreksi kuitansi"><svg class="ic"><use href="#i-edit"/></svg> Koreksi</button>` : ''}
                  ${!r.dikoreksi_oleh ? `<button class="btn btn-danger btn-sm act-del" onclick="hapusKuitansi('${r.id}')" title="Hapus kuitansi"><svg class="ic"><use href="#i-trash"/></svg> Hapus</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-center gap-12 mt-14 flex-wrap">
        <button class="btn btn-outline btn-sm" ${kwtPage <= 0 ? 'disabled' : ''} onclick="kwtPrevPage()">← Sebelumnya</button>
        <span class="fs-13 text-muted">Halaman <strong>${kwtPage + 1}</strong> dari ${totalPages}</span>
        <button class="btn btn-outline btn-sm" ${hasNext ? '' : 'disabled'} onclick="kwtNextPage()">Berikutnya →</button>
      </div>`;
  } catch(e) {
    el.innerHTML = `
      <div class="p-24 text-center">
        <div class="fs-32 mb-12"><svg class="ic"><use href="#i-alert"/></svg></div>
        <div class="fw-700 fs-15 text-danger mb-8">Gagal Memuat Riwayat Kuitansi</div>
        <div class="fs-13 text-muted mb-16">Terjadi kesalahan saat mengambil data dari server.</div>
        <div class="warn-banner">
          <strong>Detail error:</strong><br>${e.message || 'Koneksi ke Supabase gagal. Periksa koneksi internet Anda.'}
        </div>
        <button class="btn btn-primary btn-sm" onclick="loadRiwayatKuitansi()"><svg class="ic"><use href="#i-refresh"/></svg> Coba Lagi</button>
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
