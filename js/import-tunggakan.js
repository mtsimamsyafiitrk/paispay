// ── SiPay · Import Tunggakan & Riwayat Pembayaran ──
// Memasukkan tunggakan lama (SPP per bulan lintas tahun ajaran + uang pangkal,
// pembangunan, dll) dari file rekap ke dalam aplikasi, sehingga saat petugas
// memilih santri di menu "Input Pembayaran" seluruh tunggakannya langsung
// muncul dan bisa dilunasi/diangsur.
//
// Format yang didukung:
//   1. JSON per santri  — array objek { nama, status, kelas_terakhir,
//      tunggakan_pangkal, tunggakan_pembangunan, tagihan_spp:[ … ] }
//      (mis. DATA_SIPAY.json hasil rekap).
//   2. Baris per bulan  — CSV / XLSX / JSON array dengan kolom
//      nama_santri, tahun_ajaran, kelas, bulan (atau periode), nominal,
//      dibayar, sisa. Opsional: tunggakan_pangkal, tunggakan_pembangunan.
//
// Data masuk ke:
//   • students.spp_history[TA].months  → tunggakan SPP tahun-tahun sebelumnya
//   • students.spp + spp_paid_months   → SPP tahun ajaran berjalan
//   • tagihan (item pangkal/pembangunan/…) → tunggakan non-SPP

// Buffer hasil parsing: array record santri ternormalisasi.
let tgBuffer = [];
// Ringkasan hasil parsing untuk layar pratinjau.
let tgSummary = null;

// Label bawaan item tunggakan non-SPP yang dikenali dari nama kolom/field.
const TG_ITEM_LABEL = {
  pangkal:     'Uang Pangkal',
  pembangunan: 'Uang Pembangunan',
  pendaftaran: 'Uang Pendaftaran',
  buku:        'Uang Buku',
  seragam:     'Uang Seragam',
};

// ══════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════
function tgGoStep(n) {
  [1, 2].forEach(i => {
    const el = document.getElementById('tg_step' + i);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

function openImportTunggakanModal() {
  tgBuffer = [];
  tgSummary = null;
  const f = document.getElementById('tgFile');
  if (f) f.value = '';
  tgGoStep(1);
  document.getElementById('importTunggakanModal').classList.add('open');
}

function closeImportTunggakanModal() {
  document.getElementById('importTunggakanModal').classList.remove('open');
}

// ══════════════════════════════════════════
// BACA FILE
// ══════════════════════════════════════════
function handleTunggakanFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();

  if (ext === 'json') {
    reader.onload = e => {
      try { tgIngest(JSON.parse(e.target.result)); }
      catch (err) { toast('⚠️ File JSON tidak valid: ' + err.message); }
    };
    reader.readAsText(file);
  } else if (ext === 'csv' || ext === 'txt') {
    reader.onload = e => tgIngest(tgParseCSV(e.target.result));
    reader.readAsText(file);
  } else {
    if (typeof XLSX === 'undefined') {
      toast('⚠️ Library Excel belum tersedia — gunakan file .csv atau .json');
      return;
    }
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        // Utamakan sheet rincian per bulan bila ada (file rekap punya banyak sheet).
        const name = wb.SheetNames.find(n => /TAGIHAN\s*SPP\s*PER\s*BULAN/i.test(n)) || wb.SheetNames[0];
        tgIngest(XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }));
      } catch (err) { toast('⚠️ Gagal membaca file: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }
}

// CSV → array objek. Sadar tanda kutip & BOM, header dinormalisasi ke huruf kecil.
function tgParseCSV(text) {
  const clean = String(text || '').replace(/^﻿/, '').trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/);
  const splitLine = line => {
    const out = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
        else cur += c;
      } else if (c === '"') { quoted = true; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(v => v.trim());
  };
  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] != null ? cells[idx] : ''; });
    rows.push(obj);
  }
  return rows;
}

// ══════════════════════════════════════════
// NORMALISASI
// ══════════════════════════════════════════
function tgNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const t = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  const n = Number(t);
  return isFinite(n) ? n : 0;
}

// Ambil nilai kolom pertama yang terisi dari beberapa kemungkinan nama kolom.
function tgPick(obj, keys) {
  for (const k of keys) {
    for (const v of [k, k.toLowerCase(), k.toUpperCase(), k.replace(/_/g, ' '), k.replace(/_/g, ' ').toUpperCase()]) {
      if (obj[v] !== undefined && obj[v] !== '') return obj[v];
    }
  }
  return '';
}

function tgNormKelas(k) {
  const t = String(k == null ? '' : k).trim();
  if (!t || t === '-') return '';
  if (/^VIII/i.test(t)) return '8';
  if (/^IX/i.test(t))   return '9';
  if (/^VII/i.test(t))  return '7';
  if (/^[789]$/.test(t)) return t;
  return t; // kelas non-reguler (mis. "MLZ 1") dipertahankan apa adanya
}

// Status di file rekap → status_kelulusan internal. Kosong = santri aktif.
function tgNormStatus(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t || /^aktif/.test(t)) return '';
  if (/lulus|alumni|selesai|tamat|graduat/.test(t)) return 'lulus';
  if (/keluar|berhenti|mengundurkan|drop/.test(t))  return 'keluar';
  if (/pindah|mutasi|transfer/.test(t))             return 'pindah';
  return '';
}

// Tahun ajaran → "2024/2025". Menerima "2024/2025", "2024-2025", "24/25".
function tgNormTA(v) {
  const t = String(v == null ? '' : v).trim();
  const m = t.match(/(\d{2,4})\s*[\/\-]\s*(\d{2,4})/);
  if (!m) return t;
  const a = m[1].length === 2 ? '20' + m[1] : m[1];
  const b = m[2].length === 2 ? '20' + m[2] : m[2];
  return a + '/' + b;
}

function tgTaStartYear(ta) { return parseInt(String(ta || '').slice(0, 4), 10) || 0; }

// Nominal yang paling sering muncul (dipakai sebagai "SPP/bulan" ringkas).
function tgModus(values) {
  const c = {};
  let best = 0, bestN = -1;
  values.forEach(v => { c[v] = (c[v] || 0) + 1; if (c[v] > bestN) { bestN = c[v]; best = v; } });
  return best;
}

// Record kosong untuk satu santri.
function tgBlank(nama) {
  return { nama, namaFinal: nama, kelas: '', status_kelulusan: '',
           taMasuk: '', taAkhir: '', ta: {}, items: {}, itemsRaw: {} };
}

// Gabungkan satu baris tagihan bulanan ke record santri.
function tgAddMonth(rec, ta, kelas, bulan, nominal, dibayar) {
  if (!ta || !bulan) return;
  const slot = rec.ta[ta] || (rec.ta[ta] = { kelas: '', months: {} });
  if (kelas) slot.kelas = kelas;
  const n = Math.max(0, Math.round(nominal));
  const d = Math.min(n, Math.max(0, Math.round(dibayar)));
  slot.months[bulan] = { n, d };
}

// Terima data mentah (array objek santri ATAU array baris per bulan) → tgBuffer.
function tgIngest(raw) {
  if (!Array.isArray(raw)) {
    // Bungkus umum: { data: [...] } / { santri: [...] }
    raw = (raw && (raw.data || raw.santri || raw.students)) || null;
  }
  if (!Array.isArray(raw) || !raw.length) { toast('⚠️ Tidak ada data yang bisa dibaca dari file'); return; }

  // Dikelompokkan per id santri bila file menyediakannya — dua santri berbeda
  // bisa saja bernama persis sama, dan itu harus tetap terpisah di sini.
  const byKey = new Map();
  const get = (id, nama) => {
    const key = id ? 'id:' + String(id).trim() : 'nm:' + normNama(nama);
    if (!byKey.has(key)) byKey.set(key, tgBlank(nama));
    return byKey.get(key);
  };

  const perSantri = raw.some(r => r && Array.isArray(r.tagihan_spp));

  raw.forEach(row => {
    if (!row || typeof row !== 'object') return;

    if (perSantri) {
      const nama = String(row.nama || row.nama_santri || '').trim().toUpperCase();
      if (!nama) return;
      const rec = get(row.id_santri || row.id, nama);
      rec.nama = nama;
      rec.namaFinal = nama;
      rec.kelas = tgNormKelas(row.kelas_terakhir || row.kelas) || rec.kelas;
      rec.status_kelulusan = tgNormStatus(row.status);
      rec.taMasuk = tgNormTA(row.ta_masuk) || rec.taMasuk;
      rec.taAkhir = tgNormTA(row.ta_terakhir) || rec.taAkhir;
      (row.tagihan_spp || []).forEach(t => {
        const nominal = tgNum(t.nominal);
        const dibayar = t.dibayar !== undefined ? tgNum(t.dibayar) : nominal - tgNum(t.sisa);
        tgAddMonth(rec, tgNormTA(t.tahun_ajaran), tgNormKelas(t.kelas),
          monthCode(t.bulan) || monthCode(t.periode), nominal, dibayar);
      });
      // Setiap field "tunggakan_<item>" jadi tagihan item bernama sama.
      Object.keys(row).forEach(k => {
        const m = k.match(/^tunggakan_(.+)$/i);
        if (!m) return;
        const id = m[1].toLowerCase();
        if (id === 'spp') return; // SPP ditangani lewat tagihan_spp
        rec.itemsRaw[id] = tgNum(row[k]);
      });
      return;
    }

    // Bentuk baris-per-bulan
    const nama = String(tgPick(row, ['nama_santri', 'nama', 'nama_lengkap', 'name']) || '').trim().toUpperCase();
    if (!nama || nama === 'NAMA') return;
    const rec = get(tgPick(row, ['id_santri', 'id']), nama);
    rec.nama = nama;
    rec.namaFinal = nama;
    const kelas = tgNormKelas(tgPick(row, ['kelas', 'class', 'tingkat']));
    const ta    = tgNormTA(tgPick(row, ['tahun_ajaran', 'ta', 'tahun ajaran', 'year']));
    const bulan = monthCode(tgPick(row, ['bulan', 'month'])) || monthCode(tgPick(row, ['periode', 'period']));
    const nominal = tgNum(tgPick(row, ['nominal', 'tagihan', 'jumlah']));
    const sisaRaw = tgPick(row, ['sisa', 'tunggakan']);
    const bayarRaw = tgPick(row, ['dibayar', 'terbayar', 'bayar']);
    const dibayar = bayarRaw !== '' ? tgNum(bayarRaw) : (sisaRaw !== '' ? nominal - tgNum(sisaRaw) : 0);
    if (ta && bulan && nominal > 0) tgAddMonth(rec, ta, kelas, bulan, nominal, dibayar);
    if (kelas && tgTaStartYear(ta) >= tgTaStartYear(rec._lastTA || '')) { rec.kelas = kelas; rec._lastTA = ta; }
    const st = tgNormStatus(tgPick(row, ['status_santri', 'status_kelulusan', 'keterangan_santri']));
    if (st) rec.status_kelulusan = st;
    Object.keys(row).forEach(k => {
      const m = String(k).toLowerCase().replace(/\s+/g, '_').match(/^tunggakan_(.+)$/);
      if (!m || m[1] === 'spp') return;
      const val = tgNum(row[k]);
      if (val) rec.itemsRaw[m[1]] = val;
    });
  });

  tgBuffer = [...byKey.values()].filter(r => Object.keys(r.ta).length || Object.keys(r.itemsRaw).length);
  if (!tgBuffer.length) { toast('⚠️ Tidak ada data tunggakan yang dikenali di file'); return; }

  tgBuild();
  tgRenderPreview();
  tgGoStep(2);
}

// Hitung ringkasan + bersihkan nilai item (negatif = kelebihan bayar → 0).
function tgBuild() {
  const taSet = new Map(); // ta → { sisa, bulan }
  const itemTotal = {};
  const warnNegatif = [];
  let totalSPP = 0;

  tgBuffer.forEach(rec => {
    rec.items = {};
    Object.entries(rec.itemsRaw).forEach(([id, val]) => {
      if (val < 0) { warnNegatif.push(`${rec.nama} — ${TG_ITEM_LABEL[id] || id}: ${rp(val)}`); }
      const v = Math.max(0, Math.round(val));
      rec.items[id] = v;
      if (v > 0) itemTotal[id] = (itemTotal[id] || 0) + v;
    });

    const taKeys = Object.keys(rec.ta).sort((a, b) => tgTaStartYear(a) - tgTaStartYear(b));
    if (!rec.taMasuk && taKeys.length) rec.taMasuk = taKeys[0];
    if (!rec.taAkhir && taKeys.length) rec.taAkhir = taKeys[taKeys.length - 1];

    rec.totalSPP = 0;
    Object.entries(rec.ta).forEach(([ta, slot]) => {
      let sisa = 0, bln = 0;
      Object.values(slot.months).forEach(x => {
        const s = Math.max(0, x.n - x.d);
        if (s > 0) { sisa += s; bln++; }
      });
      rec.totalSPP += sisa;
      const agg = taSet.get(ta) || { sisa: 0, bulan: 0, santri: 0 };
      agg.sisa += sisa; agg.bulan += bln; if (sisa > 0) agg.santri++;
      taSet.set(ta, agg);
    });
    totalSPP += rec.totalSPP;
  });

  const taList = [...taSet.keys()].sort((a, b) => tgTaStartYear(a) - tgTaStartYear(b));
  tgSummary = {
    taList,
    taStat: taSet,
    itemTotal,
    totalSPP,
    warnNegatif,
    duplikat: [],
    curTA: taList.length ? taList[taList.length - 1] : (getProfil().ta || ''),
  };
  tgSummary.duplikat = tgApplyDedup(true);
}

// Satu nama santri = satu baris di database, sementara file rekap bisa memuat
// dua santri berbeda yang namanya persis sama (mis. seorang alumni & seorang
// santri aktif). Fungsi ini menetapkan nama final tiap record:
//   pisah = true  → santri yang masih aktif / paling akhir bersekolah memakai
//                   nama asli, sisanya diberi keterangan angkatan.
//   pisah = false → semua dibiarkan bernama sama sehingga digabung saat disimpan.
// Mengembalikan daftar grup nama kembar untuk ditampilkan sebagai peringatan.
function tgApplyDedup(pisah) {
  const groups = new Map();
  tgBuffer.forEach(r => {
    const k = normNama(r.nama);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });

  const dup = [];
  groups.forEach(list => {
    if (list.length < 2) { list[0].namaFinal = list[0].nama; return; }
    const urut = [...list].sort((a, b) =>
      (a.status_kelulusan ? 1 : 0) - (b.status_kelulusan ? 1 : 0) ||
      tgTaStartYear(b.taAkhir) - tgTaStartYear(a.taAkhir));
    urut.forEach((r, i) => {
      r.namaFinal = (!pisah || i === 0) ? r.nama
        : `${r.nama} (Angkatan ${r.taMasuk || r.taAkhir || (i + 1)})`;
    });
    dup.push({ nama: urut[0].nama, anggota: urut });
  });
  return dup;
}

// ══════════════════════════════════════════
// PRATINJAU
// ══════════════════════════════════════════
function tgRenderPreview() {
  const S = tgSummary;
  // Pertahankan pilihan admin saat panel digambar ulang (ganti TA berjalan).
  const curTA = document.getElementById('tgCurrentTA')?.value || S.curTA;
  const prevProfilTA = document.getElementById('tgSetProfilTA');
  const prevStatus   = document.getElementById('tgSetStatus');
  const keepProfilTA = prevProfilTA ? prevProfilTA.checked : true;
  const keepStatus   = prevStatus ? prevStatus.checked : true;
  const prevTimpa    = document.getElementById('tgTimpaItem');
  const keepTimpa    = prevTimpa ? prevTimpa.checked : false;
  const prevPisah    = document.getElementById('tgPisahDuplikat');
  const pisah        = prevPisah ? prevPisah.checked : true;
  const duplikat     = tgApplyDedup(pisah);

  const targets = tgResolveTargets();
  const mirip = tgBuffer.filter(r => targets.get(r).via === 'mirip');
  const baru  = tgBuffer.filter(r => targets.get(r).via === 'baru').length;
  const cocok = tgBuffer.length - baru;

  // Tunggakan SPP yang akan tercatat sebagai "tahun ajaran sebelumnya"
  let sppPrev = 0, sppCur = 0;
  const sebagianCurTA = [];
  tgBuffer.forEach(rec => Object.entries(rec.ta).forEach(([ta, slot]) => {
    Object.entries(slot.months).forEach(([m, x]) => {
      const sisa = Math.max(0, x.n - x.d);
      if (!sisa) return;
      if (ta === curTA) {
        sppCur += sisa;
        if (x.d > 0) sebagianCurTA.push(`${rec.nama} — ${MONTH_FULL[m]} (sudah ${rp(x.d)} dari ${rp(x.n)})`);
      } else sppPrev += sisa;
    });
  }));

  const itemRows = Object.entries(S.itemTotal)
    .map(([id, tot]) => `<tr><td>${esc(TG_ITEM_LABEL[id] || id)}</td><td style="text-align:right;font-weight:700;color:var(--danger);">${rp(tot)}</td></tr>`)
    .join('');

  const taRows = S.taList.map(ta => {
    const a = S.taStat.get(ta);
    const isCur = ta === curTA;
    return `<tr${isCur ? ' style="background:var(--primary-pale);"' : ''}>
      <td>${esc(ta)}${isCur ? ' <span style="font-size:10px;font-weight:700;color:var(--primary);">TA BERJALAN</span>' : ''}</td>
      <td style="text-align:right;">${a.santri}</td>
      <td style="text-align:right;">${a.bulan}</td>
      <td style="text-align:right;font-weight:700;color:${a.sisa > 0 ? 'var(--danger)' : 'var(--primary-light)'};">${rp(a.sisa)}</td>
    </tr>`;
  }).join('');

  const sample = [...tgBuffer].sort((a, b) => (b.totalSPP + tgItemSum(b)) - (a.totalSPP + tgItemSum(a))).slice(0, 25);
  const sampleRows = sample.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${esc(r.namaFinal)}</td>
    <td>${esc(r.kelas || '—')}</td>
    <td>${esc(r.status_kelulusan || 'aktif')}</td>
    <td style="text-align:right;">${rp(r.totalSPP)}</td>
    <td style="text-align:right;">${rp(tgItemSum(r))}</td>
    <td style="text-align:right;font-weight:700;">${rp(r.totalSPP + tgItemSum(r))}</td>
  </tr>`).join('');

  const warnBlocks = [];
  if (duplikat.length) warnBlocks.push(`<div style="background:var(--danger-pale);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;line-height:1.6;">
    ⚠️ <strong>${duplikat.length} nama santri kembar</strong> — di file ini ada santri berbeda dengan nama persis sama.
    Aplikasi menyimpan satu baris per nama, jadi keduanya harus dibedakan atau akan tergabung.
    <div style="margin-top:6px;color:var(--text-muted);">
      ${duplikat.slice(0, 5).map(g => esc(g.nama) + ' → ' +
        g.anggota.map(r => esc(r.namaFinal) + ' (' + esc(r.status_kelulusan || 'aktif') + ', s.d. ' + esc(r.taAkhir || '—') + ')').join(' &nbsp;•&nbsp; ')
      ).join('<br>')}${duplikat.length > 5 ? '<br>…' : ''}
    </div>
    <label style="display:flex;align-items:center;gap:7px;margin-top:8px;cursor:pointer;font-weight:600;">
      <input type="checkbox" id="tgPisahDuplikat"${pisah ? ' checked' : ''} onchange="tgRenderPreview()"
        style="accent-color:var(--primary);width:15px;height:15px;">
      Pisahkan sebagai santri berbeda (tambahkan keterangan angkatan pada nama)
    </label>
    ${pisah ? '' : '<div style="margin-top:6px;color:var(--danger);font-weight:600;">Tanpa dipisah, tunggakan kedua santri akan digabung menjadi satu data.</div>'}
  </div>`);
  if (mirip.length) warnBlocks.push(`<div style="background:#fef9c3;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;line-height:1.6;">
    ⚠️ <strong>${mirip.length} nama dicocokkan berdasarkan kemiripan</strong> (bukan tulisan persis sama).
    Periksa daftar berikut — bila ternyata orang yang berbeda, perbaiki ejaan nama di file lalu import ulang.
    <div style="margin-top:6px;color:var(--text-muted);">
      ${mirip.slice(0, 6).map(r => esc(r.namaFinal) + ' → ' + esc(appState.students[targets.get(r).idx].nama) + ' (' + targets.get(r).skor + '%)').join('<br>')}${mirip.length > 6 ? '<br>…' : ''}
    </div>
  </div>`);
  if (sebagianCurTA.length) warnBlocks.push(`<div style="background:#fef9c3;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;line-height:1.6;">
    ⚠️ <strong>${sebagianCurTA.length} bulan pada TA berjalan terbayar sebagian.</strong>
    Alur SPP tahun berjalan hanya mengenal status lunas/belum per bulan, jadi bulan ini akan
    tercatat <em>belum lunas</em> (nominal penuh). Sesuaikan lewat menu Koreksi bila perlu.
    <div style="margin-top:6px;color:var(--text-muted);">${sebagianCurTA.slice(0, 5).map(esc).join('<br>')}${sebagianCurTA.length > 5 ? '<br>…' : ''}</div>
  </div>`);
  if (S.warnNegatif.length) warnBlocks.push(`<div style="background:#fef9c3;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:12px;line-height:1.6;">
    ⚠️ <strong>${S.warnNegatif.length} nilai tunggakan negatif</strong> (kelebihan bayar) — dianggap <strong>0</strong>.
    <div style="margin-top:6px;color:var(--text-muted);">${S.warnNegatif.slice(0, 5).map(esc).join('<br>')}${S.warnNegatif.length > 5 ? '<br>…' : ''}</div>
  </div>`);

  document.getElementById('tgPreview').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
      <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Santri di file</div>
        <div style="font-size:18px;font-weight:800;color:var(--primary);">${tgBuffer.length}</div>
        <div style="font-size:10px;color:var(--text-muted);">${cocok} cocok · ${baru} baru</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Tunggakan SPP TA lalu</div>
        <div style="font-size:18px;font-weight:800;color:var(--danger);">${rp(sppPrev)}</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">SPP TA berjalan belum lunas</div>
        <div style="font-size:18px;font-weight:800;color:var(--accent);">${rp(sppCur)}</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:11px;color:var(--text-muted);">Tunggakan item lain</div>
        <div style="font-size:18px;font-weight:800;color:var(--danger);">${rp(Object.values(S.itemTotal).reduce((a, b) => a + b, 0))}</div>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:14px;">
      <label>Tahun Ajaran Berjalan</label>
      <select id="tgCurrentTA" onchange="tgRenderPreview()">
        ${S.taList.map(ta => `<option value="${esc(ta)}"${ta === curTA ? ' selected' : ''}>${esc(ta)}</option>`).join('')}
      </select>
      <div style="font-size:11px;color:var(--text-muted);margin-top:5px;line-height:1.5;">
        TA ini masuk ke alur SPP normal (kolom SPP &amp; bulan dibayar).
        Semua tahun ajaran lain disimpan sebagai <strong>tunggakan SPP tahun ajaran sebelumnya</strong>.
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" id="tgSetProfilTA"${keepProfilTA ? ' checked' : ''} style="accent-color:var(--primary);width:15px;height:15px;">
      Set tahun ajaran madrasah ke <strong>${esc(curTA)}</strong> (Profil Madrasah)
    </label>
    <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" id="tgSetStatus"${keepStatus ? ' checked' : ''} style="accent-color:var(--primary);width:15px;height:15px;">
      Perbarui status santri (aktif / lulus / pindah / keluar) sesuai file
    </label>
    <label style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;margin-bottom:14px;cursor:pointer;">
      <input type="checkbox" id="tgTimpaItem"${keepTimpa ? ' checked' : ''} style="accent-color:var(--primary);width:15px;height:15px;margin-top:2px;">
      <span>Timpa nominal tagihan item yang <strong>sudah ada</strong> (pangkal, pembangunan, dll)
        <span style="display:block;color:var(--text-muted);font-size:11px;line-height:1.5;">
          Biarkan mati bila ini import ulang: file hanya memuat sisa saat file dibuat, sehingga
          menimpanya akan memunculkan kembali tunggakan yang sudah dilunasi lewat aplikasi.
          Tagihan yang belum ada tetap dibuat.</span></span>
    </label>

    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:6px;">📅 Tunggakan SPP per Tahun Ajaran</div>
        <div class="table-wrap"><table><thead><tr><th>TA</th><th style="text-align:right;">Santri</th><th style="text-align:right;">Bulan</th><th style="text-align:right;">Tunggakan</th></tr></thead>
        <tbody>${taRows}</tbody></table></div>
      </div>
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--primary);margin-bottom:6px;">📋 Tunggakan Item Lain</div>
        <div class="table-wrap"><table><thead><tr><th>Item</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="2" style="color:var(--text-muted);">Tidak ada</td></tr>'}</tbody></table></div>
      </div>
    </div>

    ${warnBlocks.join('')}

    <div style="font-weight:700;font-size:13px;color:var(--primary);margin:16px 0 6px;">👥 25 Tunggakan Terbesar</div>
    <div class="table-wrap" style="max-height:280px;overflow-y:auto;">
      <table><thead><tr><th>#</th><th>Nama</th><th>Kelas</th><th>Status</th>
        <th style="text-align:right;">SPP</th><th style="text-align:right;">Item lain</th><th style="text-align:right;">Total</th></tr></thead>
      <tbody>${sampleRows}</tbody></table>
    </div>`;
}

function tgItemSum(rec) {
  return Object.values(rec.items || {}).reduce((a, b) => a + b, 0);
}

// ══════════════════════════════════════════
// TERAPKAN
// ══════════════════════════════════════════
async function confirmImportTunggakan() {
  if (!tgBuffer.length) { toast('⚠️ Belum ada data untuk diimport'); return; }
  if (!hasAdminSession()) { toast('⚠️ Login sebagai admin dulu untuk menyimpan data'); return; }

  const curTA       = document.getElementById('tgCurrentTA')?.value || tgSummary.curTA;
  const setProfilTA = !!document.getElementById('tgSetProfilTA')?.checked;
  const setStatus   = !!document.getElementById('tgSetStatus')?.checked;
  const pisahDup    = document.getElementById('tgPisahDuplikat')
    ? document.getElementById('tgPisahDuplikat').checked : true;
  const timpaItem   = !!document.getElementById('tgTimpaItem')?.checked;
  tgApplyDedup(pisahDup);

  const btn = document.getElementById('tgConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan...'; }
  showSyncIndicator('⏳ Menerapkan data tunggakan...');

  let baru = 0, diperbarui = 0;
  const touched = [];
  const tagihanOps = [];
  let itemDitambah = 0;

  // Dipetakan sekali di awal terhadap daftar santri sebelum import, supaya
  // santri baru yang ditambahkan di tengah proses tidak ikut jadi kandidat
  // pencocokan (dan tidak menggeser hasil yang sudah ditentukan).
  const targets = tgResolveTargets();

  try {
    tgBuffer.forEach(rec => {
      const idx = targets.get(rec).idx;
      let s;
      if (idx >= 0) { s = appState.students[idx]; diperbarui++; }
      else {
        s = { nama: rec.namaFinal, kelas: rec.kelas || '', nisn: '', spp: 0,
              spp_paid_months: [], spp_history: {}, status_kelulusan: '' };
        appState.students.push(s);
        baru++;
      }

      if (rec.kelas) s.kelas = rec.kelas;
      if (setStatus) s.status_kelulusan = rec.status_kelulusan || '';
      s.spp_history = (s.spp_history && typeof s.spp_history === 'object' && !Array.isArray(s.spp_history))
        ? s.spp_history : {};

      Object.entries(rec.ta).forEach(([ta, slot]) => {
        if (ta === curTA) {
          const nominals = Object.values(slot.months).map(x => x.n).filter(n => n > 0);
          if (nominals.length) s.spp = tgModus(nominals);
          // Gabung dengan bulan yang sudah tercatat lunas di aplikasi supaya
          // pembayaran yang masuk setelah file dibuat tidak ikut terhapus.
          const lunas = Object.keys(slot.months).filter(m => slot.months[m].n - slot.months[m].d <= 0);
          s.spp_paid_months = MONTHS.filter(m => lunas.includes(m) || (s.spp_paid_months || []).includes(m));
        } else {
          s.spp_history[ta] = tgMergeHistory(s.spp_history[ta], slot);
        }
      });

      Object.entries(rec.items).forEach(([itemId, sisaTarget]) => {
        const target = Math.max(0, Math.round(sisaTarget));
        const ex = findTagihan(s.nama, itemId);
        if (ex) {
          // Tagihan item sudah ada. File hanya memuat SISA saat file dibuat,
          // jadi menyetel ulang nominal setelah ada pembayaran akan
          // "menghidupkan" tunggakan yang sudah lunas — hanya dilakukan bila
          // admin memang meminta penimpaan.
          if (!timpaItem) return;
          const paid = Math.max(0, ex.paid_amount || 0);
          const nominal = paid + target;
          if (nominal !== (ex.nominal || 0)) {
            tagihanOps.push({ id: ex.id, nama: s.nama, kelas: s.kelas, item_id: itemId,
              item_name: ex.item_name, nominal, paid_amount: paid });
          }
        } else if (target > 0) {
          if (tgEnsurePayItem(itemId)) itemDitambah++;
          tagihanOps.push({ nama: s.nama, kelas: s.kelas, item_id: itemId,
            item_name: tgItemName(itemId), nominal: target, paid_amount: 0 });
        }
      });

      touched.push(s);
    });

    appState.students.sort((a, b) => a.nama.localeCompare(b.nama));

    // Simpan bertahap agar payload tiap request tetap wajar.
    for (let i = 0; i < touched.length; i += 50) {
      await saveStudentsBatch(touched.slice(i, i + 50));
      showSyncIndicator(`⏳ Menyimpan santri ${Math.min(i + 50, touched.length)}/${touched.length}...`);
    }
    for (let i = 0; i < tagihanOps.length; i += 100) {
      await upsertTagihanBatch(tagihanOps.slice(i, i + 100));
      showSyncIndicator(`⏳ Menyimpan tagihan ${Math.min(i + 100, tagihanOps.length)}/${tagihanOps.length}...`);
    }
    if (itemDitambah) await saveSettings();

    if (setProfilTA && curTA) {
      const p = getProfil();
      p.ta = curTA;
      localStorage.setItem('sipay_profil', JSON.stringify(p));
      await saveSettings();
    }

    showSyncIndicator('✅ Data tunggakan tersimpan', 2500);
    closeImportTunggakanModal();
    renderSiswaTable(); renderTunggakan(); renderDashboard();
    if (typeof renderItemList === 'function') renderItemList();
    toast(`✅ Import tunggakan: ${baru} santri baru, ${diperbarui} diperbarui, ${tagihanOps.length} tagihan item`);
  } catch (e) {
    console.error('confirmImportTunggakan error:', e);
    showSyncIndicator('⚠️ Gagal menyimpan: ' + e.message, 4000);
    toast('⚠️ Gagal menyimpan data tunggakan — cek koneksi lalu ulangi');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Terapkan ke Aplikasi'; }
  }
}

// Gabungkan entri spp_history lama dengan data dari file. Bulan dianggap sudah
// dibayar bila SALAH SATU sumber menyatakan demikian — import tidak boleh
// "menghidupkan kembali" tunggakan yang sudah dilunasi lewat aplikasi.
function tgMergeHistory(existing, slot) {
  const ex     = (existing && typeof existing === 'object') ? existing : null;
  const exRich = (ex && ex.months && typeof ex.months === 'object' && !Array.isArray(ex.months)) ? ex.months : null;
  const exPaid = (ex && Array.isArray(ex.spp_paid_months)) ? ex.spp_paid_months : [];
  const exRate = ex ? (Number(ex.spp) || 0) : 0;

  const months = {};
  MONTHS.forEach(m => {
    const inc = slot.months[m];
    const old = exRich ? exRich[m] : (exRate > 0 ? { n: exRate, d: exPaid.includes(m) ? exRate : 0 } : null);
    if (!inc && !old) return;
    const n = inc ? inc.n : old.n;
    let d = Math.max(inc ? inc.d : 0, old ? old.d : 0);
    if (!exRich && exPaid.includes(m)) d = n; // bentuk ringkas: lunas = penuh
    months[m] = { n, d: Math.min(n, d) };
  });

  const nominals = Object.values(months).map(x => x.n).filter(n => n > 0);
  return {
    spp: nominals.length ? tgModus(nominals) : exRate,
    spp_paid_months: Object.keys(months).filter(m => months[m].n - months[m].d <= 0),
    kelas: slot.kelas || (ex && ex.kelas) || '',
    months,
  };
}

// Petakan tiap record di file ke santri yang sudah terdaftar.
// Pencocokan persis dijalankan lebih dulu untuk SEMUA record, baru sisanya
// dicoba lewat kemiripan nama — dan satu santri lama hanya boleh diklaim oleh
// satu record. Tanpa aturan ini, dua santri berbeda yang namanya mirip
// (mis. kakak-adik) akan tergabung menjadi satu data.
// Mengembalikan Map: record → { idx, via: 'persis' | 'mirip' | 'baru', skor }.
function tgResolveTargets() {
  const existing = appState.students;
  const claimed = new Set();
  const hasil = new Map();
  const sisa = [];

  tgBuffer.forEach(rec => {
    const norm = normNama(rec.namaFinal);
    let idx = -1;
    for (let i = 0; i < existing.length; i++) {
      if (!claimed.has(i) && normNama(existing[i].nama) === norm) { idx = i; break; }
    }
    if (idx >= 0) { claimed.add(idx); hasil.set(rec, { idx, via: 'persis' }); }
    else sisa.push(rec);
  });

  sisa.forEach(rec => {
    let best = -1, bestScore = 0;
    for (let i = 0; i < existing.length; i++) {
      if (claimed.has(i)) continue;
      const sc = nameSimilarity(rec.namaFinal, existing[i].nama);
      if (sc >= 0.85 && sc > bestScore) { best = i; bestScore = sc; }
    }
    if (best >= 0) { claimed.add(best); hasil.set(rec, { idx: best, via: 'mirip', skor: Math.round(bestScore * 100) }); }
    else hasil.set(rec, { idx: -1, via: 'baru' });
  });

  return hasil;
}

function tgItemName(itemId) {
  const def = appState.payItems.find(i => i.id === itemId);
  if (def) return def.name;
  return TG_ITEM_LABEL[itemId] || ('Uang ' + itemId.charAt(0).toUpperCase() + itemId.slice(1));
}

// Pastikan definisi item ada di "Kelola Item Bayar" agar bisa dikelola admin.
// Dibuat nonaktif: tagihan yang bersisa tetap muncul di Input Pembayaran lewat
// jalur tunggakan, jadi item ini tidak memenuhi form santri yang tak punya tagihan.
function tgEnsurePayItem(itemId) {
  if (appState.payItems.find(i => i.id === itemId)) return false;
  appState.payItems.push({
    id: itemId, name: TG_ITEM_LABEL[itemId] || tgItemName(itemId),
    amount: 0, type: 'tetap', active: false, kelas: ['7', '8', '9'],
  });
  return true;
}

// ── Drag & drop + klik latar untuk menutup ──
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('importTunggakanModal');
  if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeImportTunggakanModal(); });

  const zone = document.getElementById('tgZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary-light)';
    zone.style.background = 'var(--primary-pale)';
  });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; zone.style.background = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = ''; zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) handleTunggakanFile({ files: [file] });
  });
});

// ── AUTH ──
