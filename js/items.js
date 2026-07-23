// ── SiPay · Item Management & Detail Modal ──
function showDetail(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('modalTitle').textContent = s.nama;
  const sppT = sppTunggakan(s), itemT = itemsTunggakan(s);
  const totalT = sppT + itemT;
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
      ⚠️ Nama mirip ditemukan: ${dupes.map(d => `<strong>${esc(d.a === s.nama ? d.b : d.a)}</strong> (${d.score}%)`).join(', ')}
      — Periksa apakah ini siswa yang sama.
    </div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div><div style="font-size:11px;color:var(--text-muted);">Kelas</div><div style="font-weight:700;">${esc(s.kelas)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">NISN</div><div style="font-weight:700;">${esc(s.nisn||'—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">SPP/bulan</div><div style="font-weight:700;">${rp(s.spp)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Item Tagihan</div><div style="font-weight:700;">${rp(tagPaid)} / ${rp(tagNominal)}</div></div>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--primary);">Status SPP TA Ini</div>
      <div class="month-grid">${MONTHS.map(m=>`<div class="month-btn ${(s.spp_paid_months||[]).includes(m)?'paid':''}">${m}</div>`).join('')}</div>
    </div>
    <div style="background:${totalT>0?'var(--danger-pale)':'var(--primary-pale)'};border-radius:10px;padding:14px;">
      ${sppT > 0 ? `<div style="margin-bottom:4px;"><strong>Tunggakan SPP:</strong> ${rp(sppT)}</div>` : ''}
      ${itemT > 0 ? `<div style="margin-bottom:4px;"><strong>Tunggakan Item Tagihan:</strong> ${rp(itemT)}</div>` : ''}
      ${totalT===0 ? '<div style="color:var(--primary-light);font-weight:700;">✓ Semua pembayaran lunas!</div>' : `<div style="font-weight:700;margin-top:4px;">Total: ${rp(totalT)}</div>`}
    </div>
    ${otherTAHtml}
    ${dupesHtml}
    <div style="margin-top:16px;display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="closeModal();quickInput('${escJs(s.nama)}')">💳 Bayar Sekarang</button>
      <button class="btn btn-outline" onclick="closeModal();showCetakForStudent('${escJs(s.nama)}')">📄 Cetak Surat</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ── CETAK / PDF ──
