// ── SiPay · Item Management & Detail Modal ──
function showDetail(nama) {
  const s = getStudent(nama);
  if (!s) return;
  document.getElementById('modalTitle').textContent = s.nama;
  const sppT = sppTunggakan(s), pangkalT = pangkalTunggakan(s), crossT = crossTATunggakan(s);
  const totalT = sppT + pangkalT + crossT;

  // Cek nama mirip (fuzzy duplicate warning)
  const dupes = detectDuplicateNames().filter(d => d.a === s.nama || d.b === s.nama);

  const otherTAHtml = ''

  // Warning nama mirip
  const dupesHtml = dupes.length ? `
    <div style="background:#fef9c3;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:12px;">
      ⚠️ Nama mirip ditemukan: ${dupes.map(d => `<strong>${d.a === s.nama ? d.b : d.a}</strong> (${d.score}%)`).join(', ')}
      — Periksa apakah ini siswa yang sama.
    </div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div><div style="font-size:11px;color:var(--text-muted);">Kelas</div><div style="font-weight:700;">${s.kelas}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">NISN</div><div style="font-weight:700;">${s.nisn||'—'}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">SPP/bulan</div><div style="font-weight:700;">${rp(s.spp)}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">Uang Pangkal</div><div style="font-weight:700;">${rp(s.pangkal)}</div></div>
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--primary);">Status SPP TA Ini</div>
      <div class="month-grid">${MONTHS.map(m=>`<div class="month-btn ${(s.spp_paid_months||[]).includes(m)?'paid':''}">${m}</div>`).join('')}</div>
    </div>
    <div style="background:${totalT>0?'var(--danger-pale)':'var(--primary-pale)'};border-radius:10px;padding:14px;">
      ${sppT > 0 ? `<div style="margin-bottom:4px;"><strong>Tunggakan SPP:</strong> ${rp(sppT)}</div>` : ''}
      ${pangkalT > 0 ? `<div style="margin-bottom:4px;"><strong>Sisa Pangkal:</strong> ${rp(pangkalT)}</div>` : ''}
      ${crossT > 0 ? `<div style="margin-bottom:4px;color:var(--danger);"><strong>Tunggakan Lintas TA:</strong> ${rp(crossT)}</div>` : ''}
      ${totalT===0 ? '<div style="color:var(--primary-light);font-weight:700;">✓ Semua pembayaran lunas!</div>' : `<div style="font-weight:700;margin-top:4px;">Total: ${rp(totalT)}</div>`}
    </div>
    ${otherTAHtml}
    ${dupesHtml}
    <div style="margin-top:16px;display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="closeModal();quickInput('${s.nama.replace(/'/g,"\\'")}')">💳 Bayar Sekarang</button>
      <button class="btn btn-outline" onclick="closeModal();showCetakForStudent('${s.nama.replace(/'/g,"\\'")}')">📄 Cetak Surat</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }
// [dipindah ke DOMContentLoaded]

// ── CETAK / PDF ──
