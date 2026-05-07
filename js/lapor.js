// ── SiPay · Laporan (Wali & Admin) ──
function renderLaporPage() {
  const { siswa, perTA, taMap } = guestData;
  if (!siswa) return;
  const MONTHS_KEY  = ['Jul','Agt','Sep','Okt','Nov','Des','Jan','Feb','Mar','Apr','Mei','Jun'];
  const MONTHS_FULL = {Jul:'Juli',Agt:'Agustus',Sep:'September',Okt:'Oktober',Nov:'November',Des:'Desember',Jan:'Januari',Feb:'Februari',Mar:'Maret',Apr:'April',Mei:'Mei',Jun:'Juni'};
  const fmt = n => Number(n||0).toLocaleString('id-ID');

  // Susun opsi dropdown tunggakan dari semua TA
  const sel = document.getElementById('laporItem');
  sel.innerHTML = '<option value="">-- Pilih item tunggakan --</option>';

  const allPerTA = perTA || [];
  // Pangkal kumulatif — ambil MAX pangkal_paid dari semua TA
  const nominalPangkalG = allPerTA.reduce((max, s) => Math.max(max, s.pangkal||0), 0);
  const totalPaidG      = allPerTA.reduce((max, s) => Math.max(max, s.pangkal_paid||0), 0);
  const sisaPangkalG    = Math.max(0, nominalPangkalG - totalPaidG);

  // Tambah opsi pangkal hanya sekali jika masih ada sisa
  if (sisaPangkalG > 0 && allPerTA.length) {
    const taAktifRec = allPerTA[allPerTA.length - 1]; // TA terakhir = TA aktif
    const taLbl = taAktifRec.taLabel || taMap?.[taAktifRec.ta_id] || 'TA Aktif';
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ ta_id: taAktifRec.ta_id, ta_label: taLbl, type: 'pangkal', label: 'Uang Pangkal', nominal: sisaPangkalG });
    opt.textContent = `Uang Pangkal — Sisa Rp ${fmt(sisaPangkalG)}`;
    sel.appendChild(opt);
  }

  // SPP per TA tetap terpisah (wajar karena per tahun)
  allPerTA.forEach(s => {
    const taLbl = s.taLabel || taMap?.[s.ta_id] || 'TA ?';
    MONTHS_KEY.filter(m => !(s.spp_paid_months||[]).includes(m)).forEach(m => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ ta_id: s.ta_id, ta_label: taLbl, type: 'spp', label: 'SPP ' + (MONTHS_FULL[m]||m), nominal: s.spp||0 });
      opt.textContent = `[TA ${taLbl}] SPP ${MONTHS_FULL[m]||m} — Rp ${fmt(s.spp||0)}`;
      sel.appendChild(opt);
    });
  });

  // Auto-isi nominal saat pilih item
  sel.onchange = () => {
    try {
      const v = JSON.parse(sel.value);
      document.getElementById('laporNominal').value = v.nominal || '';
    } catch { document.getElementById('laporNominal').value = ''; }
  };

  // Selalu refresh riwayat tiap buka halaman
  loadRiwayatLaporan();
}

function previewBukti(input) {
  laporBuktiFile = input.files[0];
  if (!laporBuktiFile) return;
  const wrap = document.getElementById('laporBuktiPreview');
  if (laporBuktiFile.type.startsWith('image/')) {
    const url = URL.createObjectURL(laporBuktiFile);
    wrap.innerHTML = `<img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;"><br><span style="font-size:11px;color:var(--text-muted);">${laporBuktiFile.name}</span>`;
  } else {
    wrap.innerHTML = `📄 <strong>${laporBuktiFile.name}</strong><br><span style="font-size:11px;color:var(--text-muted);">PDF terpilih</span>`;
  }
  document.getElementById('laporBuktiWrap').style.borderColor = 'var(--primary)';
}

async function uploadBukti(file, nama) {
  if (!file) return null;
  const ext  = file.name.split('.').pop();
  const path = `${nama.replace(/\s+/g,'_')}_${Date.now()}.${ext}`;
  const res  = await fetch(SB_UPLOAD_URL + path, {
    method: 'PUT',
    headers: { ...SB_HDR, 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  });
  if (!res.ok) { const t = await res.text(); throw new Error('Upload gagal: ' + t); }
  return SB_STORAGE_URL + path;
}

async function kirimLaporan() {
  const errEl = document.getElementById('laporError');
  errEl.style.display = 'none';
  const itemVal = document.getElementById('laporItem').value;
  const nominal = Number(document.getElementById('laporNominal').value) || 0;
  const catatan = document.getElementById('laporCatatan').value.trim();
  if (!itemVal) { errEl.textContent = 'Pilih item tunggakan terlebih dahulu.'; errEl.style.display='block'; return; }
  if (!nominal) { errEl.textContent = 'Isi nominal pembayaran.'; errEl.style.display='block'; return; }
  if (!laporBuktiFile) { errEl.textContent = 'Upload bukti pembayaran terlebih dahulu.'; errEl.style.display='block'; return; }

  const btn = document.querySelector('#page-lapor .btn-primary');
  btn.disabled = true; btn.textContent = '⏳ Mengirim...';

  try {
    const item = JSON.parse(itemVal);
    const { siswa } = guestData;

    // Upload bukti ke Supabase Storage
    let bukti_url = null;
    try {
      bukti_url = await uploadBukti(laporBuktiFile, siswa.nama);
    } catch(e) {
      // Jika storage belum disetup, lanjut tanpa bukti URL
      console.warn('Upload bukti gagal:', e.message);
    }

    // Simpan laporan ke Supabase
    await sb('payment_reports', 'POST', {
      nama: siswa.nama, kelas: siswa.kelas,
      ta_id: item.ta_id, ta_label: item.ta_label,
      item_type: item.type, item_label: item.label,
      nominal, catatan, bukti_url, status: 'pending',
    }, { 'Prefer': 'return=minimal' });

    // Kirim email notifikasi ke admin
    await kirimEmailNotifAdmin({ siswa, item, nominal, catatan, bukti_url });

    // Reset form
    document.getElementById('laporItem').value = '';
    document.getElementById('laporNominal').value = '';
    document.getElementById('laporCatatan').value = '';
    document.getElementById('laporBuktiPreview').innerHTML = '📎 Klik untuk upload foto bukti<br><span style="font-size:11px;">JPG/PNG/PDF, maks 5MB</span>';
    document.getElementById('laporBuktiWrap').style.borderColor = '';
    document.getElementById('laporBuktiInput').value = '';
    laporBuktiFile = null;

    toast('✅ Laporan berhasil dikirim! Admin akan memverifikasi segera.');
    loadRiwayatLaporan();
    updateLaporBadge();
  } catch(e) {
    errEl.textContent = 'Gagal mengirim: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '📤 Kirim Laporan ke Admin';
  }
}

async function kirimEmailNotifAdmin({ siswa, item, nominal, catatan, bukti_url }) {
  const akun = JSON.parse(localStorage.getItem('sipay_akun') || '{}');
  const adminEmail = akun.email || '';
  if (!adminEmail || typeof emailjs === 'undefined') return;
  const fmt = n => Number(n||0).toLocaleString('id-ID');
  try {
    await emailjs.send(EMAILJS_SVC, EMAILJS_TPL, {
      to_email: adminEmail,
      subject: `[SiPay] Laporan Pembayaran — ${siswa.nama}`,
      message: `Laporan pembayaran baru masuk:\n\nSantri : ${siswa.nama} (Kelas ${siswa.kelas})\nTA     : ${item.ta_label}\nItem   : ${item.label}\nNominal: Rp ${fmt(nominal)}\nCatatan: ${catatan||'-'}\nBukti  : ${bukti_url||'Tidak ada'}\n\nSilakan verifikasi di menu Laporan Masuk pada aplikasi SiPay.`,
    }, EMAILJS_KEY);
  } catch(e) { console.warn('Email notif gagal:', e.message); }
}

async function loadRiwayatLaporan() {
  const { siswa } = guestData;
  if (!siswa) return;
  const el = document.getElementById('laporRiwayat');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;font-size:13px;">Memuat...</div>';
  try {
    const rows = await sb('payment_reports?select=*&nama=eq.' + encodeURIComponent(siswa.nama) + '&order=created_at.desc');
    if (!rows.length) { el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px;">Belum ada laporan yang dikirim.</div>'; return; }
    const fmt = n => Number(n||0).toLocaleString('id-ID');
    const statusStyle = { pending:'background:#fef9c3;color:#854d0e;', diterima:'background:#dcfce7;color:#166534;', ditolak:'background:#fee2e2;color:#991b1b;' };
    const statusLabel = { pending:'⏳ Menunggu', diterima:'✅ Diterima', ditolak:'❌ Ditolak' };
    el.innerHTML = rows.map(r => `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;font-size:14px;">${r.item_label}</div>
            <div style="font-size:12px;color:var(--text-muted);">TA ${r.ta_label} • Rp ${fmt(r.nominal)}</div>
          </div>
          <span style="${statusStyle[r.status]||statusStyle.pending}border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">${statusLabel[r.status]||r.status}</span>
        </div>
        ${r.catatan ? `<div style="font-size:12px;color:#555;margin-bottom:6px;">💬 ${r.catatan}</div>` : ''}
        ${r.bukti_url ? `<a href="${r.bukti_url}" target="_blank" style="font-size:12px;color:var(--primary);text-decoration:none;">📎 Lihat Bukti</a>` : ''}
        ${r.admin_note ? `<div style="font-size:12px;color:#555;margin-top:6px;padding:8px;background:var(--primary-pale);border-radius:8px;">📝 Catatan admin: ${r.admin_note}</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>`).join('');
    // Update badge
    const badge = document.getElementById('guestLaporBadge');
    const pending = rows.filter(r=>r.status==='pending').length;
    if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline' : 'none'; }
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:13px;">Gagal memuat: ${e.message}</div>`;
  }
}

async function updateLaporBadge() {
  const { siswa } = guestData;
  if (!siswa) return;
  try {
    const rows = await sb('payment_reports?select=id,status&nama=eq.' + encodeURIComponent(siswa.nama) + '&status=eq.pending');
    const badge = document.getElementById('guestLaporBadge');
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length ? 'inline' : 'none'; }
  } catch {}
}

// ── Admin: Laporan Masuk ──
async function loadLaporanMasuk() {
  const el = document.getElementById('laporanMasukList');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;">Memuat laporan...</div>';
  try {
    let url = 'payment_reports?select=*&order=created_at.desc';
    if (laporanFilter !== 'semua') url += '&status=eq.' + laporanFilter;
    const rows = await sb(url);

    // Update badge admin
    const allPending = await sb('payment_reports?select=id&status=eq.pending');
    const adminBadge = document.getElementById('adminLaporBadge');
    if (adminBadge) { adminBadge.textContent = allPending.length; adminBadge.style.display = allPending.length ? 'inline' : 'none'; }

    if (!rows.length) { el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:32px;font-size:13px;">Tidak ada laporan ' + laporanFilter + '.</div>'; return; }

    const fmt = n => Number(n||0).toLocaleString('id-ID');
    el.innerHTML = rows.map(r => `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div>
            <div style="font-weight:700;font-size:15px;">${r.nama} <span style="font-size:12px;font-weight:400;color:var(--text-muted);">— Kelas ${r.kelas||'?'}</span></div>
            <div style="font-size:13px;color:var(--primary);font-weight:600;">${r.item_label} · TA ${r.ta_label||'?'}</div>
            <div style="font-size:13px;margin-top:2px;">Nominal: <strong>Rp ${fmt(r.nominal)}</strong></div>
          </div>
          <span style="${r.status==='pending'?'background:#fef9c3;color:#854d0e;':r.status==='diterima'?'background:#dcfce7;color:#166534;':'background:#fee2e2;color:#991b1b;'}border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;white-space:nowrap;">
            ${r.status==='pending'?'⏳ Pending':r.status==='diterima'?'✅ Diterima':'❌ Ditolak'}
          </span>
        </div>
        ${r.catatan ? `<div style="font-size:13px;color:#555;margin-bottom:10px;padding:8px 12px;background:#f9f9f9;border-radius:8px;">💬 "${r.catatan}"</div>` : ''}
        ${r.bukti_url ? `<div style="margin-bottom:10px;">
          <a href="${r.bukti_url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--primary);text-decoration:none;border:1px solid var(--primary);padding:6px 14px;border-radius:8px;">📎 Lihat Bukti Pembayaran</a>
        </div>` : '<div style="font-size:12px;color:#999;margin-bottom:10px;">Tidak ada bukti dilampirkan</div>'}
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Dilaporkan: ${new Date(r.created_at).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
        ${r.status === 'pending' ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="note_${r.id}" placeholder="Catatan (opsional)" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
          <button class="btn btn-primary" style="font-size:12px;padding:8px 14px;" onclick="updateLaporan('${r.id}','diterima')">✅ Terima</button>
          <button class="btn btn-outline" style="font-size:12px;padding:8px 14px;color:var(--danger);border-color:var(--danger);" onclick="updateLaporan('${r.id}','ditolak')">❌ Tolak</button>
        </div>` : `${r.admin_note ? `<div style="font-size:12px;padding:8px 12px;background:var(--primary-pale);border-radius:8px;color:var(--primary);">📝 Catatan admin: ${r.admin_note}</div>` : ''}`}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);padding:16px;">Gagal: ${e.message}</div>`;
  }
}

async function updateLaporan(id, status) {
  const note = document.getElementById('note_' + id)?.value?.trim() || '';
  try {
    await sb('payment_reports?id=eq.' + id, 'PATCH', { status, admin_note: note, updated_at: new Date().toISOString() }, { 'Prefer': 'return=minimal' });
    toast(status === 'diterima' ? '✅ Laporan diterima' : '❌ Laporan ditolak');
    loadLaporanMasuk();
  } catch(e) { toast('⚠️ Gagal: ' + e.message); }
}

function filterLaporan(f) {
  laporanFilter = f;
  ['pending','diterima','ditolak','semua'].forEach(k => {
    const btn = document.getElementById('filter' + k.charAt(0).toUpperCase() + k.slice(1));
    if (btn) btn.className = k === f ? 'btn btn-primary' : 'btn btn-outline';
    if (btn) btn.style.fontSize = '12px';
  });
  loadLaporanMasuk();
}

