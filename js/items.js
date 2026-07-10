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
      ⚠️ Nama mirip ditemukan: ${dupes.map(d => `<strong>${d.a === s.nama ? d.b : d.a}</strong> (${d.score}%)`).join(', ')}
      — Periksa apakah ini siswa yang sama.
    </div>` : '';

  document.getElementById('modalBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div><div style="font-size:11px;color:var(--text-muted);">Kelas</div><div style="font-weight:700;">${s.kelas}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">NISN</div><div style="font-weight:700;">${s.nisn||'—'}</div></div>
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
    <div style="margin-top:14px;background:var(--bg,#f7f7f7);border:1px dashed var(--border);border-radius:10px;padding:12px 14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">🔑 Kode Akses Wali</div>
      ${s.access_code
        ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
             <code style="font-size:18px;font-weight:800;letter-spacing:2px;color:var(--primary);background:#fff;border:1px solid var(--border);border-radius:6px;padding:4px 12px;">${s.access_code}</code>
             <button class="btn btn-outline btn-sm" onclick="copyAccessCode('${s.access_code}')">📋 Salin</button>
             <button class="btn btn-outline btn-sm" onclick="regenerateAccessCode('${s.nama.replace(/'/g,"\\'")}')">🔄 Ganti</button>
           </div>
           <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Berikan kode ini ke wali santri untuk login mode Pengunjung.</div>`
        : `<button class="btn btn-primary btn-sm" onclick="regenerateAccessCode('${s.nama.replace(/'/g,"\\'")}')">🔑 Buat Kode Akses</button>`}
    </div>
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
