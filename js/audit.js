// ── SiPay · Periksa & Pulihkan Data ──
// ══════════════════════════════════════════
// Alat rekonsiliasi untuk memulihkan pembayaran yang HILANG karena bug
// tulis-timpa lintas device (sebelum perbaikan sinkronisasi).
//
// KENAPA BISA DIPULIHKAN:
//   Tabel `kuitansi` bersifat TAMBAH-SAJA — tiap pembayaran menulis satu baris
//   kuitansi dan baris itu tidak pernah ditimpa oleh device lain. Yang dulu
//   tertimpa hanyalah data TURUNAN-nya: `students.spp_paid_months`,
//   `students.spp_history`, dan `tagihan.paid_amount`.
//
//   Jadi kuitansi adalah buku besar (ledger) yang bisa dibaca ulang untuk
//   mencari pembayaran yang kuitansinya ada tapi tidak tercatat lunas.
//
// PRINSIP KEAMANAN — HANYA MENAMBAH, TIDAK PERNAH MENGURANGI:
//   Bug-nya menyebabkan data HILANG, bukan data palsu. Jadi pemulihan hanya
//   boleh menandai yang belum tertandai. Bulan yang sudah lunas tidak akan
//   dibatalkan, nominal terbayar tidak akan diturunkan. Dengan begitu alat ini
//   tidak bisa merusak data yang sudah benar.
//
// YANG TIDAK BISA DIPULIHKAN (tidak ada jejaknya di buku besar):
//   • Perubahan identitas santri (nama/kelas/NISN/nominal SPP) yang tertimpa.
//   • Nominal tagihan (`tagihan.nominal`) yang tertimpa.
//   • Profil madrasah yang sempat terkosongkan.
//   • Isian yang belum sempat disimpan sama sekali (browser ditutup di tengah).
// ══════════════════════════════════════════

const AUDIT_BI_PREFIX = 'BI-';   // kuitansi Buku Induk = arsip, jangan diputar ulang

let auditResult = null;   // hasil pemeriksaan terakhir

// TA tujuan bulan SPP pada satu baris kuitansi — beserta seberapa yakin.
//
// Ada dua sumber informasi, dan keandalannya JAUH berbeda:
//
//   'nama'  — nama item bertuliskan "SPP Tunggakan TA 2024/2025". Ini ditulis
//             oleh alur pembayaran tunggakan, jadi TA-nya PASTI.
//
//   'label' — kolom `ta_label` kuitansi. Ini hanya merekam isi Profil Madrasah
//             → Tahun Ajaran PADA SAAT pembayaran disimpan, BUKAN tahun ajaran
//             yang dibayar. Contoh nyata: calon santri kelas 7 TA 2026/2027
//             membayar SPP Juli–Oktober lebih awal, saat profil masih tertulis
//             2025/2026 → kuitansinya ber-ta_label 2025/2026 padahal bulan yang
//             dibayar milik 2026/2027. Jadi label hanya boleh dipakai sebagai
//             DUGAAN, tidak pernah sebagai dasar menyimpulkan data hilang.
function _auditTargetTA(kwt, item, currentTA) {
  const m = String(item.name || '').match(/Tunggakan\s+TA\s+([0-9]{4}\s*\/\s*[0-9]{4})/i);
  if (m) return { ta: m[1].replace(/\s+/g, ''), sumber: 'nama' };
  const label = String(kwt.ta_label || '').trim();
  if (label && label !== currentTA) return { ta: label, sumber: 'label' };
  return { ta: null, sumber: 'berjalan' };
}

// Baca buku besar kuitansi & hitung kondisi yang SEHARUSNYA tercatat.
async function auditLedger() {
  const currentTA = (getProfil().ta || '').trim();

  showSyncIndicator('🔍 Membaca buku besar kuitansi...');
  const kwts = await sbAll('kuitansi?select=*&order=created_at.asc,id.asc');

  const byNo = {};
  kwts.forEach(k => { if (k.no_kuitansi) byNo[k.no_kuitansi] = k; });

  // nama → { spp:Set, histPasti:{ta:Set}, histDuga:{ta:Set}, tagihan:{id:nominal} }
  //   spp       : bulan SPP tahun ajaran berjalan
  //   histPasti : TA dari nama item ("SPP Tunggakan TA …") — dasarnya kuat
  //   histDuga  : TA dari ta_label saja — hanya dugaan, lihat _auditTargetTA()
  const exp = {};
  const slot = nama => (exp[nama] || (exp[nama] = {
    spp: new Set(), histPasti: {}, histDuga: {}, tagihan: {},
  }));
  const taSet = (nama, bucket, ta) => {
    const b = slot(nama)[bucket];
    return b[ta] || (b[ta] = new Set());
  };

  const addBulan = (kwt, item, sign) => {
    // Angsuran (bayar sebagian) tidak berarti bulannya lunas — dilewati.
    if (!item.bulan || item.angsur) return;
    const { ta, sumber } = _auditTargetTA(kwt, item, currentTA);
    const set = !ta ? slot(kwt.nama).spp
              : taSet(kwt.nama, sumber === 'nama' ? 'histPasti' : 'histDuga', ta);
    if (sign > 0) set.add(item.bulan); else set.delete(item.bulan);
  };
  const addTagihan = (nama, itemId, amount) => {
    if (!itemId || itemId === 'spp') return;
    const t = slot(nama).tagihan;
    t[itemId] = (t[itemId] || 0) + amount;
  };

  let dilewatiBI = 0;
  kwts.forEach(kwt => {
    if (String(kwt.no_kuitansi || '').toUpperCase().startsWith(AUDIT_BI_PREFIX)) { dilewatiBI++; return; }
    if (!kwt.nama || !Array.isArray(kwt.items)) return;

    kwt.items.forEach(item => {
      const dibatalkan = item._dibatalkan || item._tipe === 'batalkan';
      const dikoreksi  = item._koreksi    || item._tipe === 'koreksi_nilai';

      if (kwt.is_koreksi) {
        if (dibatalkan) {
          // item.amount pada kuitansi koreksi "batalkan" = nominal asli
          addBulan(kwt, item, -1);
          addTagihan(kwt.nama, item.item_id, -(Number(item.amount) || 0));
        } else if (dikoreksi) {
          // item.amount = nilai BARU; selisihnya perlu nominal asli dari
          // kuitansi yang dikoreksi.
          const ref = byNo[kwt.ref_no_kuitansi];
          const asal = ref && Array.isArray(ref.items)
            ? ref.items.find(x => x.item_id === item.item_id && (x.bulan || null) === (item.bulan || null))
            : null;
          if (asal) {
            addTagihan(kwt.nama, item.item_id, (Number(item.amount) || 0) - (Number(asal.amount) || 0));
          }
        }
      } else {
        addBulan(kwt, item, +1);
        addTagihan(kwt.nama, item.item_id, Number(item.amount) || 0);
      }
    });
  });

  // ── Bandingkan dengan kondisi tercatat sekarang ──
  showSyncIndicator('🔍 Membandingkan dengan data tercatat...');
  const students = await loadStudents();
  const tagihan  = await loadTagihan();
  const byNama   = {};
  students.forEach(s => { byNama[s.nama] = s; });

  const temuanSpp = [];      // { nama, bulan: [], ta: null|'2024/2025' }
  const temuanTagihan = [];  // { nama, item_id, item_name, tercatat, seharusnya, selisih, id }
  const tanpaSantri = [];    // kuitansi atas nama yang tidak ada di tabel santri
  const histTanpaRecord = [];// bulan TA lama yang belum punya entri spp_history

  Object.entries(exp).forEach(([nama, e]) => {
    const s = byNama[nama];
    if (!s) { tanpaSantri.push(nama); return; }

    const hist = (s.spp_history && typeof s.spp_history === 'object') ? s.spp_history : {};
    const bulanBerjalan = new Set(s.spp_paid_months || []);
    const bulanHist = ta => new Set(((hist[ta] || {}).spp_paid_months) || []);

    // ── SPP tahun ajaran berjalan ──
    // Sudah tercatat di riwayat TA mana pun juga dianggap beres: bisa jadi
    // bulan itu memang milik tahun lalu dan sudah diarsipkan promosi kelas.
    const adaDiRiwayatManapun = b => Object.values(hist)
      .some(rec => (rec && rec.spp_paid_months || []).includes(b));
    const kurang = [...e.spp].filter(b => !bulanBerjalan.has(b) && !adaDiRiwayatManapun(b));
    if (kurang.length) temuanSpp.push({ nama, ta: null, bulan: kurang });

    // ── Tunggakan TA lama, TA-nya PASTI (dari nama item) ──
    Object.entries(e.histPasti).forEach(([ta, set]) => {
      const sudahH = bulanHist(ta);
      const kurangH = [...set].filter(b => !sudahH.has(b));
      if (!kurangH.length) return;
      if (!hist[ta]) {
        // Belum ada entri TA itu — memulihkannya berarti menebak nominal SPP
        // tahun tersebut. Dilaporkan saja, tidak diperbaiki otomatis.
        histTanpaRecord.push({ nama, ta, bulan: kurangH, sebab: 'tanpa-entri' });
        return;
      }
      temuanSpp.push({ nama, ta, bulan: kurangH });
    });

    // ── TA dari ta_label saja: hanya DUGAAN ──
    // ta_label merekam isi profil saat pembayaran disimpan, bukan tahun ajaran
    // yang dibayar. Karena itu bulan yang sudah tercatat lunas DI MANA PUN
    // (tahun berjalan maupun riwayat TA mana saja) dianggap beres — jangan
    // sampai santri baru yang membayar di muka dilaporkan sebagai data hilang.
    Object.entries(e.histDuga).forEach(([ta, set]) => {
      const sudahH = bulanHist(ta);
      const kurangH = [...set].filter(b =>
        !sudahH.has(b) && !bulanBerjalan.has(b) && !adaDiRiwayatManapun(b));
      if (!kurangH.length) return;
      if (!hist[ta]) {
        histTanpaRecord.push({ nama, ta, bulan: kurangH, sebab: 'tanpa-entri' });
        return;
      }
      temuanSpp.push({ nama, ta, bulan: kurangH });
    });

    Object.entries(e.tagihan).forEach(([itemId, seharusnya]) => {
      const t = tagihan.find(x => x.nama === nama && x.item_id === itemId);
      if (!t) return;   // tidak ada baris tagihan — di luar jangkauan alat ini
      const selisih = Math.round(seharusnya - (t.paid_amount || 0));
      if (selisih > 0) {
        temuanTagihan.push({
          nama, item_id: itemId, item_name: t.item_name, id: t.id,
          tercatat: t.paid_amount || 0, seharusnya: Math.round(seharusnya), selisih,
        });
      }
    });
  });

  showSyncIndicator('✅ Pemeriksaan selesai', 2000);
  auditResult = {
    diperiksa: kwts.length, dilewatiBI,
    temuanSpp, temuanTagihan, tanpaSantri, histTanpaRecord,
    waktu: new Date(),
  };
  return auditResult;
}

// ══ UI ══
function openAuditModal() {
  document.getElementById('auditModal').classList.add('open');
  document.getElementById('auditBody').innerHTML =
    '<div class="p-24 text-center text-muted fs-13">'
    + 'Klik <strong>Mulai Periksa</strong> untuk membaca ulang seluruh kuitansi dan '
    + 'membandingkannya dengan data yang tercatat.<br><br>'
    + 'Pemeriksaan ini <strong>hanya membaca</strong> — tidak mengubah apa pun.</div>';
  document.getElementById('auditApplyBtn').style.display = 'none';
}
function closeAuditModal() {
  document.getElementById('auditModal').classList.remove('open');
}

async function runAudit() {
  const btn = document.getElementById('auditRunBtn');
  if (btn) { btn.disabled = true; setIconText(btn, '⏳ Memeriksa...'); }
  document.getElementById('auditBody').innerHTML =
    '<div class="p-24 text-center text-muted fs-13"><svg class="ic"><use href="#i-clock"/></svg> Membaca buku besar kuitansi...</div>';
  pauseAutoSync();
  try {
    const r = await auditLedger();
    renderAuditResult(r);
  } catch(e) {
    console.error('runAudit:', e);
    document.getElementById('auditBody').innerHTML =
      `<div class="warn-box"><svg class="ic"><use href="#i-alert"/></svg> Gagal memeriksa: ${esc(e.message)}</div>`;
  } finally {
    resumeAutoSync();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#i-search"/></svg> Periksa Ulang'; }
  }
}

function renderAuditResult(r) {
  const totalBulan = r.temuanSpp.reduce((a, t) => a + t.bulan.length, 0);
  const totalRupiah = r.temuanTagihan.reduce((a, t) => a + t.selisih, 0);
  const bersih = !totalBulan && !r.temuanTagihan.length && !r.tanpaSantri.length && !r.histTanpaRecord.length;

  let html = `<div class="info-box mb-14">
    Diperiksa <strong>${r.diperiksa}</strong> kuitansi
    ${r.dilewatiBI ? `(<strong>${r.dilewatiBI}</strong> kuitansi Buku Induk dilewati — murni arsip)` : ''}.
  </div>`;

  if (bersih) {
    html += `<div class="info-box" style="background:#dcfce7;color:#166534;">
      <svg class="ic"><use href="#i-check"/></svg> <strong>Tidak ada pembayaran yang hilang.</strong> Semua kuitansi cocok dengan data yang tercatat.
    </div>`;
    document.getElementById('auditBody').innerHTML = html;
    document.getElementById('auditApplyBtn').style.display = 'none';
    return;
  }

  if (totalBulan) {
    html += `<div class="group-title">
      <svg class="ic"><use href="#i-cal"/></svg> Bulan SPP berkuitansi tapi belum tercatat lunas — <span class="text-danger">${totalBulan} bulan</span>
    </div>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
    <table style="width:100%;font-size:12.5px;border-collapse:collapse;">
      <thead><tr class="bg-bg sticky top-0">
        <th class="text-left p-6-10">Santri</th>
        <th class="text-left p-6-10">Tahun Ajaran</th>
        <th class="text-left p-6-10">Bulan</th>
      </tr></thead><tbody>`;
    r.temuanSpp.forEach(t => {
      html += `<tr class="border-t-1-border">
        <td class="p-6-10">${esc(t.nama)}</td>
        <td class="p-6-10">${t.ta ? esc(t.ta) : 'Berjalan'}</td>
        <td class="p-6-10">${esc(t.bulan.map(b => MONTH_FULL[b] || b).join(', '))}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (r.temuanTagihan.length) {
    html += `<div class="group-title">
      <svg class="ic"><use href="#i-card"/></svg> Tagihan item: kuitansi mencatat lebih besar dari yang tersimpan — <span class="text-danger">${rp(totalRupiah)}</span>
    </div>
    <div class="warn-box mb-8">
      <svg class="ic"><use href="#i-alert"/></svg> Periksa bagian ini dulu sebelum diterapkan. Bila Anda pernah memakai
      <strong>Import Tunggakan</strong>, nominal terbayar sebagian santri disetel
      langsung dari file (bukan dari kuitansi), sehingga selisih di sini bisa saja
      <em>bukan</em> data hilang. Centang penerapannya hanya jika angkanya masuk akal.
    </div>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
    <table style="width:100%;font-size:12.5px;border-collapse:collapse;">
      <thead><tr class="bg-bg sticky top-0">
        <th class="text-left p-6-10">Santri</th>
        <th class="text-left p-6-10">Item</th>
        <th class="text-right p-6-10">Tercatat</th>
        <th class="text-right p-6-10">Menurut kuitansi</th>
        <th class="text-right p-6-10">Selisih</th>
      </tr></thead><tbody>`;
    r.temuanTagihan.forEach(t => {
      html += `<tr class="border-t-1-border">
        <td class="p-6-10">${esc(t.nama)}</td>
        <td class="p-6-10">${esc(t.item_name)}</td>
        <td class="p-6-10 text-right">${rp(t.tercatat)}</td>
        <td class="p-6-10 text-right">${rp(t.seharusnya)}</td>
        <td class="p-6-10 text-right text-danger fw-600">+${rp(t.selisih)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (r.histTanpaRecord.length) {
    html += `<div class="group-title"><svg class="ic"><use href="#i-pin"/></svg> Perlu diperiksa sendiri</div>
    <div class="warn-box">
    Ada ${r.histTanpaRecord.length} bulan SPP berkuitansi yang <strong>tidak bisa dipastikan</strong>
    milik tahun ajaran mana, dan santrinya belum punya entri riwayat SPP untuk tahun tersebut.
    <strong>Tidak diperbaiki otomatis</strong> — silakan dicocokkan sendiri:<br><br>
    ${r.histTanpaRecord.slice(0, 12).map(h => `• ${esc(h.nama)} — TA ${esc(h.ta)} (${esc(h.bulan.map(b => MONTH_FULL[b] || b).join(', '))})`).join('<br>')}
    ${r.histTanpaRecord.length > 12 ? `<br>• …dan ${r.histTanpaRecord.length - 12} lainnya` : ''}
    <br><br>
    <strong>Sering kali ini bukan masalah.</strong> Tahun ajaran di sini ditebak dari kolom
    <code>ta_label</code> kuitansi, yang hanya merekam isi <em>Profil Madrasah → Tahun Ajaran</em>
    pada saat pembayaran disimpan — bukan tahun ajaran yang dibayar. Jadi kalau santri baru
    membayar SPP di muka sebelum profil diganti ke tahun ajaran berikutnya, namanya akan muncul
    di sini padahal pembayarannya sudah tercatat benar. Cek saja santrinya di
    <em>Input Pembayaran</em>: bila bulan-bulan itu sudah tercentang lunas, abaikan baris ini.
    </div>`;
  }

  if (r.tanpaSantri.length) {
    html += `<div class="warn-box mt-12">
      ${r.tanpaSantri.length} kuitansi atas nama yang tidak ada lagi di data santri
      (kemungkinan santri sudah dihapus atau namanya diubah):
      ${esc(r.tanpaSantri.slice(0, 8).join(', '))}${r.tanpaSantri.length > 8 ? ', …' : ''}
    </div>`;
  }

  html += `<div class="mt-16 border-t-1-border pt-12">
    <div class="fw-700 fs-13 mb-8">Pilih yang akan dipulihkan:</div>
    <label class="flex items-center gap-8 fs-13 pointer mb-6">
      <input class="accent-primary" type="checkbox" id="auditFixSpp" ${totalBulan ? 'checked' : 'disabled'}>
      Tandai lunas ${totalBulan} bulan SPP di atas
    </label>
    <label class="flex items-center gap-8 fs-13 pointer">
      <input class="accent-primary" type="checkbox" id="auditFixTagihan" ${r.temuanTagihan.length ? '' : 'disabled'}>
      Tambahkan ${rp(totalRupiah)} ke nominal terbayar tagihan item <span class="text-muted">(baca peringatan di atas)</span>
    </label>
    <div class="fs-12 text-muted mt-10">
      Pemulihan hanya <strong>menambah</strong>: tidak ada bulan yang dibatalkan dan
      tidak ada nominal yang diturunkan.
    </div>
  </div>`;

  document.getElementById('auditBody').innerHTML = html;
  const applyBtn = document.getElementById('auditApplyBtn');
  applyBtn.style.display = '';
  applyBtn.disabled = false;
  applyBtn.innerHTML = '<svg class="ic"><use href="#i-save"/></svg> Terapkan Pemulihan';
}

async function applyAuditFix() {
  if (!auditResult) return;
  const fixSpp     = !!document.getElementById('auditFixSpp')?.checked;
  const fixTagihan = !!document.getElementById('auditFixTagihan')?.checked;
  if (!fixSpp && !fixTagihan) { toast('⚠️ Pilih dulu yang mau dipulihkan'); return; }

  const btn = document.getElementById('auditApplyBtn');
  btn.disabled = true; setIconText(btn, '⏳ Memulihkan...');
  pauseAutoSync();

  let okSpp = 0, okTagihan = 0, gagal = 0;
  try {
    if (fixSpp) {
      // Gabungkan per santri supaya satu santri cukup satu kali tulis.
      const perSantri = {};
      auditResult.temuanSpp.forEach(t => {
        const p = perSantri[t.nama] || (perSantri[t.nama] = { months: [], hist: {} });
        if (t.ta) {
          const rec = p.hist[t.ta] || (p.hist[t.ta] = { months: [] });
          rec.months.push(...t.bulan);
        } else {
          p.months.push(...t.bulan);
        }
      });
      const namaList = Object.keys(perSantri);
      for (let i = 0; i < namaList.length; i++) {
        const nama = namaList[i];
        const p = perSantri[nama];
        showSyncIndicator(`⏳ Memulihkan SPP ${i + 1}/${namaList.length}...`);
        try {
          // rate diambil dari entri riwayat yang sudah ada (temuan tanpa entri
          // sudah disaring keluar saat pemeriksaan), jadi tidak menebak nominal.
          const s = appState.students.find(x => x.nama === nama);
          const hist = [];
          Object.entries(p.hist).forEach(([ta, rec]) => {
            const existing = s && s.spp_history && s.spp_history[ta];
            const rate = existing ? (existing.spp || 0) : 0;
            rec.months.forEach(m => hist.push({ ta, m, delta: Infinity, rate }));   // Infinity = lunasi
          });
          await commitSppOps(nama, { cur: p.months.map(m => ({ m, add: true })), hist });
          okSpp++;
        } catch(e) { console.error('applyAuditFix spp', nama, e); gagal++; }
      }
    }

    if (fixTagihan) {
      for (let i = 0; i < auditResult.temuanTagihan.length; i++) {
        const t = auditResult.temuanTagihan[i];
        showSyncIndicator(`⏳ Memulihkan tagihan ${i + 1}/${auditResult.temuanTagihan.length}...`);
        try { await addTagihanPaid(t.id, t.selisih); okTagihan++; }
        catch(e) { console.error('applyAuditFix tagihan', t, e); gagal++; }
      }
    }
  } finally {
    resumeAutoSync();
  }

  showSyncIndicator('✅ Pemulihan selesai', 2500);
  toast(`✅ Dipulihkan: ${okSpp} santri (SPP), ${okTagihan} tagihan${gagal ? ` — ${gagal} gagal, coba lagi` : ''}`);

  await syncNow(true);
  closeAuditModal();
}
