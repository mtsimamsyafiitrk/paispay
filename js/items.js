// ── SiPay · Item Management & Detail Modal ──
function showDetail(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('modalTitle').textContent = s.nama;
  const sppT = sppTunggakan(s), prevT = sppTunggakanPrev(s), itemT = itemsTunggakan(s);
  const totalT = sppT + prevT + itemT;
  const prevList = sppTunggakanPrevList(s);
  // Agregat tagihan item (tetap) untuk ringkasan
  const tagT       = appState.tagihan.filter(t => t.nama === s.nama);
  const tagNominal = tagT.reduce((a, t) => a + (t.nominal || 0), 0);
  const tagPaid    = tagT.reduce((a, t) => a + (t.paid_amount || 0), 0);

  // Cek nama mirip (fuzzy duplicate warning)
  const dupes = detectDuplicateNames().filter(d => d.a === s.nama || d.b === s.nama);

  const otherTAHtml = ''

  // Warning nama mirip
  const dupesHtml = dupes.length ? `
    <div style="background:#fef9c3;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:12px;">
      <svg class="ic"><use href="#i-alert"/></svg> Nama mirip ditemukan: ${dupes.map(d => `<strong>${esc(d.a === s.nama ? d.b : d.a)}</strong> (${d.score}%)`).join(', ')}
      — Periksa apakah ini siswa yang sama.
    </div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div class="grid cols-2 gap-8 mb-16">
      <div><div class="hint">Kelas</div><div class="fw-700">${esc(s.kelas)}</div></div>
      <div><div class="hint">NISN</div><div class="fw-700">${esc(s.nisn||'—')}</div></div>
      <div><div class="hint">SPP/bulan</div><div class="fw-700">${rp(s.spp)}</div></div>
      <div><div class="hint">Item Tagihan</div><div class="fw-700">${rp(tagPaid)} / ${rp(tagNominal)}</div></div>
    </div>
    <div class="mb-16">
      <div class="fw-700 fs-13 mb-8 text-primary">Status SPP TA Ini</div>
      <div class="month-grid">${MONTHS.map(m => {
        const paid    = (s.spp_paid_months||[]).includes(m);
        const sebelum = !paid && isSppSebelumMasuk(s, m);
        const due     = !sebelum && isSppDueFor(s, m);
        const cls  = paid ? 'paid' : sebelum ? 'upcoming before' : due ? 'due' : 'upcoming';
        const ang  = paid ? 0 : sppBulanDibayar(s, m);
        const ttl  = (paid ? 'Lunas'
          : sebelum ? `Sebelum masuk — tidak ditagih (SPP mulai ${esc(sppMulaiLabel(s))})`
          : due ? 'Belum bayar (jatuh tempo)' : 'Belum jatuh tempo')
          + (ang > 0 ? ` — diangsur ${rp(ang)}, sisa ${rp(sppBulanSisa(s, m))}` : '');
        return `<div class="month-btn ${cls}" title="${ttl}"${ang > 0 ? ' style="outline:1.5px dashed var(--accent);"' : ''}>${m}${ang > 0 ? `<div class="fs-12 fw-500">sisa ${rp(sppBulanSisa(s, m))}</div>` : ''}</div>`;
      }).join('')}</div>
      <div class="fs-12 text-muted mt-6">
        Tunggakan SPP dihitung ${sppMulaiLabel(s) ? 'mulai <strong>' + esc(sppMulaiLabel(s)) + '</strong> (bulan santri masuk) ' : ''}s/d bulan berjalan${sppDueMonthLabel() ? ' (' + esc(sppDueMonthLabel()) + ')' : ''}.
      </div>
    </div>
    <div style="background:${totalT>0?'var(--danger-pale)':'var(--primary-pale)'};border-radius:10px;padding:14px;">
      ${sppT > 0 ? `<div class="mb-4"><strong>Tunggakan SPP:</strong> ${rp(sppT)}</div>` : ''}
      ${prevT > 0 ? `<div class="mb-4"><strong>Tunggakan SPP Tahun Lalu:</strong> ${rp(prevT)}
        <span class="hint">(${prevList.map(y => 'TA ' + esc(y.ta) + ': ' + y.unpaid.length + ' bln').join(', ')})</span></div>` : ''}
      ${itemT > 0 ? `<div class="mb-4"><strong>Tunggakan Item Tagihan:</strong> ${rp(itemT)}</div>` : ''}
      ${totalT===0 ? '<div class="text-primary-light fw-700">✓ Semua pembayaran lunas!</div>' : `<div class="fw-700 mt-4">Total: ${rp(totalT)}</div>`}
    </div>
    ${otherTAHtml}
    ${dupesHtml}
    <div class="mt-16 flex gap-8">
      <button class="btn btn-primary" onclick="closeModal();quickInput('${escJs(s.nama)}')"><svg class="ic"><use href="#i-card"/></svg> Bayar Sekarang</button>
      <button class="btn btn-outline" onclick="closeModal();showCetakForStudent('${escJs(s.nama)}')"><svg class="ic"><use href="#i-file"/></svg> Cetak Surat</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ── CETAK / PDF ──
