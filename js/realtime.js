// ── SiPay · Realtime (Supabase WebSocket) ──
// ══════════════════════════════════════════
// Menyambung ke Supabase Realtime supaya perubahan dari device lain masuk
// SEKETIKA (biasanya < 1 detik), bukan menunggu polling berkala.
//
// Cara kerja: satu channel WebSocket mendengarkan perubahan (INSERT/UPDATE/
// DELETE) pada tabel students, tagihan, transactions, kuitansi, dan settings.
// Event-nya SUDAH memuat baris yang berubah, jadi baris itu langsung dipasang
// ke appState tanpa menarik apa pun dari server (lihat _rtTerapkan di bawah).
// Bila satu perubahan tidak bisa dipastikan, barulah seluruh data ditarik ulang
// seperti dulu — di-debounce 400 ms supaya satu pembayaran yang menulis ke
// beberapa tabel hanya memicu satu tarikan.
//
// PENTING — dua syarat di sisi server:
//   1. Tabel harus masuk publication `supabase_realtime`.
//      Jalankan `supabase_migration_realtime.sql` sekali di SQL Editor.
//   2. RLS: kebijakan tabel adalah admin-only (`TO authenticated`), jadi
//      koneksi Realtime WAJIB memakai access_token admin — bukan anon key.
//      Tanpa token yang sah, event tidak akan terkirim sama sekali.
//
// Bila Realtime tidak tersedia (CDN diblokir, WebSocket ditutup jaringan
// sekolah, atau migrasi publication belum dijalankan), aplikasi TIDAK rusak:
// js/sync.js otomatis kembali ke polling 20 detik seperti biasa.
// ══════════════════════════════════════════

const RT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const RT_TABLES     = ['students', 'tagihan', 'transactions', 'kuitansi', 'settings'];
const RT_DEBOUNCE_MS = 400;    // gabungkan letupan event jadi satu tarikan data
const RT_RETRY_MS    = 15000;  // jeda coba-sambung-ulang saat channel gagal

let _rtClient   = null;
let _rtChannel  = null;
let _rtActive   = false;   // true = channel SUBSCRIBED & event mengalir
let _rtLoading  = null;    // promise pemuatan script CDN
let _rtDebounce = null;
let _rtRetry    = null;
let _rtWanted   = false;   // apakah realtime memang diminta menyala

function isRealtimeActive() { return _rtActive; }

// Muat pustaka Supabase dari CDN sekali saja.
function loadRealtimeLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
  if (_rtLoading) return _rtLoading;
  _rtLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = RT_SCRIPT_URL;
    s.async = true;
    s.onload  = () => resolve(!!(window.supabase && window.supabase.createClient));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _rtLoading;
}

function _setRealtimeStatus(active) {
  if (_rtActive === active) return;
  _rtActive = active;
  const gl = document.getElementById('gasLabel');
  if (gl && gl.textContent !== 'Offline') {
    gl.textContent = active ? 'Realtime' : 'Terhubung';
  }
  const btn = document.getElementById('syncNowBtn');
  if (btn) {
    btn.title = active
      ? 'Realtime aktif — perubahan dari device lain masuk seketika. Klik untuk tarik ulang manual.'
      : 'Ambil data terbaru dari server (semua device dibuat sama)';
  }
  // Polling jadi jaring pengaman yang lebih longgar saat realtime hidup.
  if (typeof rescheduleAutoSync === 'function') rescheduleAutoSync();
}

// ══════════════════════════════════════════
// TERAPKAN PERUBAHAN LANGSUNG KE appState
// ══════════════════════════════════════════
// Event postgres_changes sudah MEMBAWA baris yang berubah (payload.new), jadi
// menariknya lagi dari server itu mubazir. Dulu setiap event memanggil syncNow()
// — satu pembayaran menulis ke tagihan + transactions + kuitansi, jadi tiga
// event, dan hasilnya seluruh data santri + tagihan + transaksi diunduh ulang.
// Di SEMUA device, termasuk device yang baru saja menginputnya sendiri.
//
// Sekarang baris dari payload langsung dipasang ke appState, lalu halaman yang
// sedang dibuka digambar ulang. Tidak ada unduhan sama sekali.
//
// Jalur lama tetap ada sebagai jaring pengaman dan dipakai kapan pun perubahan
// TIDAK bisa dipastikan (lihat daftar di _rtTerapkan). Polling berkala tiap 2
// menit juga tetap jalan sebagai pengoreksi bila ada event yang terlewat —
// itulah sebabnya penyimpangan tidak bisa menumpuk.

const RT_RENDER_DEBOUNCE_MS = 150;   // gabungkan letupan event jadi satu gambar ulang
const RT_RENDER_RETRY_MS    = 2000;  // coba lagi bila belum boleh menggambar

let _rtRenderTimer = null;

function _rtJadwalkanRender() {
  clearTimeout(_rtRenderTimer);
  _rtRenderTimer = setTimeout(_rtRender, RT_RENDER_DEBOUNCE_MS);
}

function _rtRender() {
  _rtRenderTimer = null;
  // Menggambar ulang di balik modal yang terbuka bisa membatalkan pekerjaan
  // yang sedang berjalan (renderSiswaTable memanggil clearSelection, sehingga
  // centang baris untuk hapus massal ikut hilang). Datanya SUDAH masuk ke
  // appState; yang ditunda hanya tampilannya.
  if (document.hidden || document.querySelector('.modal-overlay.open')) {
    _rtRenderTimer = setTimeout(_rtRender, RT_RENDER_RETRY_MS);
    return;
  }
  try {
    if (typeof renderHalamanAktif === 'function') renderHalamanAktif();
    if (typeof refreshInputPageIfIdle === 'function') refreshInputPageIfIdle();
  } catch(e) { console.warn('realtime render:', e.message); }
}

// Sisipkan santri baru pada posisi terurut nama, tanpa mengurutkan ulang daftar
// yang sudah ada (urutan dari server memakai kolasi Postgres — mengurutkan ulang
// di sisi klien bisa mengacak baris yang sudah tampil).
function _rtSisipkanSantri(row) {
  const list = appState.students;
  let i = list.findIndex(s => String(s.nama).localeCompare(String(row.nama), 'id') > 0);
  if (i < 0) i = list.length;
  list.splice(i, 0, row);
}

function _rtStudents(evt, baru, lama) {
  const list = appState.students;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(s => s.id === id);
    if (i < 0) return false;   // tak dikenal → tarik ulang, jangan menebak
    list.splice(i, 1);
    return true;
  }
  if (!baru || !baru.nama) return false;
  const row = mapStudentRow(baru);
  // Cocokkan lewat id lebih dulu supaya penggantian nama (rename) memperbarui
  // baris yang sama, bukan menambah baris kedua. Santri yang baru dibuat di
  // device ini belum punya id — server membalasnya dengan return=minimal —
  // jadi nama dipakai sebagai cadangan; id-nya terisi dari event ini.
  let i = row.id ? list.findIndex(s => s.id === row.id) : -1;
  if (i < 0) i = list.findIndex(s => s.nama === row.nama);
  if (i < 0) { _rtSisipkanSantri(row); return true; }
  if (list[i].nama !== row.nama) { list.splice(i, 1); _rtSisipkanSantri(row); }
  else list[i] = row;
  return true;
}

function _rtTagihan(evt, baru, lama) {
  const list = appState.tagihan;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(t => t.id === id);
    if (i >= 0) list.splice(i, 1);
    return true;   // sudah tidak ada = hasil akhirnya sama
  }
  if (!baru || !baru.id) return false;
  const row = mapTagihanRow(baru);
  const i = list.findIndex(t => t.id === row.id);
  if (i < 0) list.push(row); else list[i] = row;
  return true;
}

function _rtTransactions(evt, baru, lama) {
  const list = appState.transactions;
  if (evt === 'DELETE') {
    const id = lama && lama.id;
    if (!id) return false;
    const i = list.findIndex(t => t.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
  if (!baru || !baru.id) return false;
  const row = mapTransactionRow(baru);
  let i = list.findIndex(t => t.id === row.id);
  // Transaksi yang baru diinput di device ini sudah masuk appState sebelum
  // id-nya kembali dari server (saveTransaction tidak ditunggu). Kenali lewat
  // isinya supaya tidak tercatat dua kali, lalu pasangkan id-nya.
  if (i < 0) {
    i = list.findIndex(t => !t.id && t.nama === row.nama && t.time === row.time &&
                            t.nominal === row.nominal && t.jenis === row.jenis);
  }
  if (i < 0) list.push(row); else list[i] = row;
  return true;
}

function _rtKuitansi() {
  // Kuitansi tidak disimpan di appState — hanya halaman Buku Induk yang
  // membacanya, dan halaman itu menarik datanya sendiri. Dulu satu kuitansi
  // baru memicu unduhan ulang santri + tagihan + transaksi yang tak dipakainya.
  if (typeof activePageId === 'function' && activePageId() === 'riwayat-kuitansi' &&
      typeof loadRiwayatKuitansi === 'function') {
    loadRiwayatKuitansi();
  }
  return true;
}

function _rtSettings() {
  // Item bayar sedang diedit di halaman Pengaturan — jangan ditimpa di tengah
  // pengeditan; serahkan ke jalur lama.
  if (typeof editingItemIdx !== 'undefined' && editingItemIdx >= 0) return false;
  if (typeof loadSettings !== 'function') return false;
  // Settings kecil (beberapa baris), jadi memuat ulang tabel itu saja sudah
  // cukup — jauh lebih murah daripada menarik seluruh data santri. Ini juga
  // menutup celah lama: syncNow() tidak pernah memuat ulang settings, sehingga
  // perubahan item bayar / profil dari device lain baru terlihat setelah reload.
  loadSettings().then(() => {
    if (typeof applyProfil === 'function')    applyProfil();
    if (typeof ensureBakuItems === 'function') ensureBakuItems();
    if (typeof renderItemList === 'function' && typeof activePageId === 'function' &&
        activePageId() === 'pengaturan') renderItemList();
    _rtJadwalkanRender();
  }).catch(() => {});
  return true;
}

// Terapkan satu event ke appState.
// true  → sudah diterapkan, tidak perlu menarik ulang apa pun.
// false → tidak bisa dipastikan; pemanggil menarik ulang seluruh data.
function _rtTerapkan(payload) {
  if (!payload) return false;
  // Payload yang terpotong (mis. "Error 413: Payload Too Large" untuk baris
  // dengan spp_history besar) tidak boleh dipercaya isinya.
  if (Array.isArray(payload.errors) && payload.errors.length) return false;
  // Proses panjang (import, promosi kelas) sedang menyentuh appState — jangan
  // diselipi perubahan dari device lain di tengah jalan.
  if (typeof isSyncPaused === 'function' && isSyncPaused()) return false;
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) return false;

  const evt  = payload.eventType || payload.event;
  const baru = payload.new || null;
  const lama = payload.old || null;
  switch (payload.table) {
    case 'students':     return _rtStudents(evt, baru, lama);
    case 'tagihan':      return _rtTagihan(evt, baru, lama);
    case 'transactions': return _rtTransactions(evt, baru, lama);
    case 'kuitansi':     return _rtKuitansi();
    case 'settings':     return _rtSettings();
    default:             return false;   // tabel tak dikenal → aman: tarik ulang
  }
}

// Satu perubahan dari device lain.
function _onRealtimeChange(payload) {
  let ok = false;
  try { ok = _rtTerapkan(payload); }
  catch(e) { console.warn('realtime apply:', e.message); ok = false; }
  if (ok) { _rtJadwalkanRender(); return; }

  // Jalur lama (di-debounce): tarik ulang seluruh data.
  // syncNow() menghormati penjagaan (modal terbuka / proses panjang berjalan).
  // Bila dilewati, penanda "dirty" membuatnya dicoba lagi sesaat kemudian —
  // jadi tidak ada perubahan yang terlewat.
  clearTimeout(_rtDebounce);
  _rtDebounce = setTimeout(() => {
    if (typeof syncNow === 'function') syncNow();
  }, RT_DEBOUNCE_MS);
}

// Perbarui token pada koneksi Realtime (dipanggil tiap kali sesi di-refresh).
function realtimeSetAuth() {
  if (!_rtClient || !_rtClient.realtime) return;
  const token = (typeof hasAdminSession === 'function' && hasAdminSession())
    ? sbSession.access_token : null;
  if (!token) return;
  try {
    const r = _rtClient.realtime.setAuth(token);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch(e) { console.warn('realtimeSetAuth:', e.message); }
}

async function startRealtime() {
  _rtWanted = true;
  if (_rtChannel) return true;                       // sudah jalan
  if (typeof hasAdminSession !== 'function' || !hasAdminSession()) return false;

  const ok = await loadRealtimeLib();
  if (!ok) {
    console.warn('Realtime: pustaka Supabase gagal dimuat — tetap memakai polling berkala.');
    return false;
  }
  if (!_rtWanted) return false;                      // keburu logout saat memuat

  try {
    if (!_rtClient) {
      // persistSession/autoRefreshToken dimatikan: sesi admin dikelola sendiri
      // oleh config.js, jangan sampai pustaka ini ikut menulis localStorage.
      _rtClient = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    realtimeSetAuth();

    let ch = _rtClient.channel('sipay-db-changes');
    RT_TABLES.forEach(table => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, _onRealtimeChange);
    });

    _rtChannel = ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        _setRealtimeStatus(true);
        clearTimeout(_rtRetry);
        // Tarik sekali saat tersambung untuk menutup celah antara halaman
        // dimuat dan channel siap — kecuali startAutoSync() baru saja menarik.
        const perlu = typeof syncedRecently !== 'function' || !syncedRecently();
        if (perlu && typeof syncNow === 'function') syncNow();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        _setRealtimeStatus(false);
        _scheduleRealtimeRetry();
      }
    });
    return true;
  } catch(e) {
    console.warn('startRealtime:', e.message);
    _setRealtimeStatus(false);
    _scheduleRealtimeRetry();
    return false;
  }
}

function _scheduleRealtimeRetry() {
  if (!_rtWanted) return;
  clearTimeout(_rtRetry);
  _rtRetry = setTimeout(() => {
    if (!_rtWanted) return;
    _teardownChannel();
    startRealtime();
  }, RT_RETRY_MS);
}

function _teardownChannel() {
  if (_rtChannel && _rtClient) {
    try { _rtClient.removeChannel(_rtChannel); } catch { /* best-effort */ }
  }
  _rtChannel = null;
}

function stopRealtime() {
  _rtWanted = false;
  clearTimeout(_rtRetry);
  clearTimeout(_rtDebounce);
  clearTimeout(_rtRenderTimer);
  _rtRenderTimer = null;
  _teardownChannel();
  _setRealtimeStatus(false);
}
