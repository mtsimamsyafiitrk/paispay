// ── SiPay · Halaman Tunggakan ──
let editingItemIdx = -1;

function renderItemList() {
  const cont = document.getElementById('itemList');
  const KELAS_ALL = ['7','8','9','calon'];
  const kelasLabel = k => k === 'calon' ? 'Kls Calon' : 'Kelas ' + k;
  cont.innerHTML = appState.payItems.map((item,idx) => {
    const typeLabel = item.type==='bulanan'?'Bulanan (SPP)':item.type==='custom'?'Custom':'Tetap';
    // "Default" = item bawaan (bukan tambahan admin). Berbasis id agar tetap
    // benar walau urutan diubah (item custom ber-id 'custom_...').
    const isDefault = !String(item.id || '').startsWith('custom_');
    const itemKelas = item.kelas || [];

    if (editingItemIdx === idx) {
      return `<div style="background:var(--primary-pale);border-radius:12px;padding:14px;margin-bottom:8px;border:1.5px solid var(--primary-light);">
        <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">✏️ Edit Item #${idx+1}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group">
            <label>Nama Item</label>
            <input type="text" id="ei_name" value="${esc(item.name)}">
          </div>
          <div class="form-group">
            <label>Nominal Default (Rp)</label>
            <input type="number" id="ei_amount" value="${item.amount||0}">
          </div>
          <div class="form-group">
            <label>Jenis</label>
            <select id="ei_type">
              <option value="tetap" ${item.type==='tetap'?'selected':''}>Tetap per Siswa</option>
              <option value="custom" ${item.type==='custom'?'selected':''}>Nominal Custom</option>
              <option value="bulanan" ${item.type==='bulanan'?'selected':''}>Bulanan (SPP)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Aktif untuk Kelas</label>
            <div style="display:flex;gap:10px;margin-top:6px;">
              ${KELAS_ALL.map(k => `<label style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:500;cursor:pointer;">
                <input type="checkbox" id="ei_kelas_${k}" value="${k}" ${(item.kelas||[]).includes(k)?'checked':''} style="accent-color:var(--primary);width:15px;height:15px;">
                ${kelasLabel(k)}
              </label>`).join('')}
            </div>
          </div>
          <div class="form-group" style="justify-content:flex-end;flex-direction:row;align-items:flex-end;gap:8px;grid-column:1/-1;">
            <button class="btn btn-primary btn-sm" onclick="saveEditItem(${idx})">💾 Simpan</button>
            <button class="btn btn-outline btn-sm" onclick="cancelEditItem()">Batal</button>
          </div>
        </div>
      </div>`;
    }

    // Badge kelas
    const _klsLabel = k => k === 'calon' ? 'Kls Calon' : 'Kls ' + k;
    const kelasBadge = itemKelas.length
      ? itemKelas.map(k => `<span style="background:${k==='calon'?'var(--accent-pale)':'var(--primary-pale)'};color:${k==='calon'?'var(--accent)':'var(--primary)'};border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;">${_klsLabel(k)}</span>`).join(' ')
      : `<span style="background:#fee2e2;color:#dc2626;border-radius:5px;padding:1px 7px;font-size:11px;font-weight:700;">Tidak ada kelas</span>`;

    return `<div draggable="true" data-idx="${idx}"
      ondragstart="onItemDragStart(event, ${idx})" ondragover="onItemDragOver(event)"
      ondragleave="onItemDragLeave(event)" ondrop="onItemDrop(event, ${idx})" ondragend="onItemDragEnd(event)"
      style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);border-radius:8px;">
      <span title="Seret untuk mengubah urutan" style="cursor:grab;color:var(--text-muted);font-size:18px;line-height:1;user-select:none;flex-shrink:0;">⠿</span>
      <label class="toggle"><input type="checkbox" ${item.active?'checked':''} onchange="toggleItem(${idx})"><span class="toggle-slider"></span></label>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13.5px;">${esc(item.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${typeLabel} • ${rp(item.amount)}${isDefault?' • <span style="color:var(--accent);">Default</span>':''}</div>
        <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;">${kelasBadge}</div>
      </div>
      <span class="badge ${item.active?'badge-green':'badge-gray'}" style="white-space:nowrap;">${item.active?'Aktif':'Nonaktif'}</span>
      <button class="btn btn-outline btn-sm" onclick="startEditItem(${idx})" title="Edit item">✏️</button>
      ${(item.id === 'spp' || item.id === 'pangkal')
        ? `<span title="Item baku — tidak bisa dihapus, hanya bisa diedit" style="color:var(--text-muted);font-size:15px;padding:0 6px;cursor:default;">🔒</span>`
        : `<button class="btn btn-danger btn-sm" onclick="confirmRemoveItem(${idx})" title="Hapus item">🗑️</button>`}
    </div>`;
  }).join('');
}

// ── Drag & drop: ubah urutan item bayar ──
// Urutan array appState.payItems = urutan tampil (di sini & di form Input).
let _dragItemFrom = -1;
function onItemDragStart(e, idx) {
  _dragItemFrom = idx;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  e.currentTarget.style.opacity = '0.4';
}
function onItemDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.style.background = 'var(--primary-pale)';
}
function onItemDragLeave(e) {
  e.currentTarget.style.background = '';
}
function onItemDragEnd() {
  document.querySelectorAll('#itemList > div').forEach(d => { d.style.background = ''; d.style.opacity = ''; });
  _dragItemFrom = -1;
}
async function onItemDrop(e, idx) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  const from = _dragItemFrom;
  _dragItemFrom = -1;
  const arr = appState.payItems;
  if (from < 0 || from === idx || from >= arr.length || idx >= arr.length) { renderItemList(); return; }
  const [moved] = arr.splice(from, 1);
  arr.splice(from < idx ? idx - 1 : idx, 0, moved); // sisip sebelum item target
  renderItemList();
  showSyncIndicator('💾 Menyimpan urutan...');
  await saveSettings();
  showSyncIndicator('✅ Urutan disimpan', 1500);
}

function startEditItem(idx) { editingItemIdx = idx; renderItemList(); }
function cancelEditItem() { editingItemIdx = -1; renderItemList(); }
async function saveEditItem(idx) {
  const name = document.getElementById('ei_name').value.trim();
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('ei_kelas_'+k)?.checked);
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  const it = appState.payItems[idx];
  const newAmount = Number(document.getElementById('ei_amount').value) || 0;
  const newType   = document.getElementById('ei_type').value;
  const amountChanged = it.amount !== newAmount;
  it.name   = name;
  it.amount = newAmount;
  it.type   = newType;
  it.kelas  = kelas;
  editingItemIdx = -1;
  saveSettings();
  // Item tetap: sinkronkan nominal baru ke tagihan santri yang sudah ada
  // (paid_amount tiap santri dipertahankan) agar sisa tagihan ikut terbarui.
  // 'pangkal' dikecualikan: nominalnya per-siswa (diatur di form Data Siswa),
  // jadi mengubah "default" di sini tak menimpa nilai per-siswa yang sudah ada.
  if (newType === 'tetap' && amountChanged && it.id !== 'pangkal') {
    showSyncIndicator('⏳ Menyinkronkan nominal tagihan...');
    try {
      const n = await updateTagihanNominalByItem(it.id, newAmount);
      showSyncIndicator(n ? `✅ ${n} tagihan santri diperbarui` : '✅ Tersimpan', 2000);
    } catch(e) { showSyncIndicator('⚠️ Gagal perbarui tagihan', 3000); }
  }
  renderItemList();
  if (typeof renderTunggakan === 'function') renderTunggakan();
  if (typeof renderDashboard === 'function') renderDashboard();
  toast('✅ Item berhasil diperbarui!');
}

async function toggleItem(idx) {
  const item = appState.payItems[idx];
  const willBeActive = !item.active;

  if (willBeActive) {
    item.active = true;
    saveSettings(); renderItemList();
    if (item.type === 'tetap') {
      showSyncIndicator('⏳ Membuat tagihan...');
      try {
        const n = await createTagihanForItem(item);
        showSyncIndicator('✅ Tagihan dibuat', 2000);
        toast(`✅ Item diaktifkan${n > 0 ? ' — ' + n + ' tagihan santri dibuat' : ''}`);
        renderTunggakan(); renderDashboard();
      } catch(e) {
        showSyncIndicator('⚠️ Gagal buat tagihan', 3000);
        toast('✅ Item diaktifkan (tagihan gagal: ' + e.message + ')');
      }
    } else {
      toast('✅ Item diaktifkan');
    }
  } else {
    _deactivatingIdx = idx;
    document.getElementById('deactivateItemName').textContent = item.name;
    const hasTagihan = appState.tagihan.some(t => t.item_id === item.id);
    document.getElementById('deactivateTagihanWarn').style.display = hasTagihan ? 'block' : 'none';
    document.getElementById('deactivateModal').classList.add('open');
  }
}

let _deactivatingIdx = -1;

function cancelDeactivate() {
  document.getElementById('deactivateModal').classList.remove('open');
  _deactivatingIdx = -1;
  renderItemList();
}

async function confirmDeactivateKeep() {
  if (_deactivatingIdx < 0) return;
  appState.payItems[_deactivatingIdx].active = false;
  saveSettings(); renderItemList(); renderTunggakan(); renderDashboard();
  document.getElementById('deactivateModal').classList.remove('open');
  toast('⭕ Item dinonaktifkan — record tagihan tetap tersimpan');
  _deactivatingIdx = -1;
}

async function confirmDeactivateDelete() {
  if (_deactivatingIdx < 0) return;
  const item = appState.payItems[_deactivatingIdx];
  item.active = false;
  document.getElementById('deactivateModal').classList.remove('open');
  showSyncIndicator('⏳ Menghapus tagihan...');
  try {
    await deleteTagihanByItemId(item.id);
    showSyncIndicator('✅ Tagihan dihapus', 2000);
  } catch(e) { showSyncIndicator('⚠️ Gagal hapus tagihan', 3000); }
  saveSettings(); renderItemList(); renderTunggakan(); renderDashboard();
  toast('🗑️ Item dinonaktifkan & semua tagihan dihapus');
  _deactivatingIdx = -1;
}
function confirmRemoveItem(idx) {
  const item = appState.payItems[idx];
  if (item.id === 'spp' || item.id === 'pangkal') {
    toast('🔒 Item baku (SPP & Uang Pangkal) tidak bisa dihapus — hanya bisa diedit.');
    return;
  }
  const name = item.name;
  document.getElementById('deleteMsg').textContent = 'Hapus item pembayaran "' + name + '"? Item ini tidak akan tersedia lagi di form input.';
  document.getElementById('deleteConfirmBtn').onclick = function() {
    appState.payItems.splice(idx,1);
    if (editingItemIdx === idx) editingItemIdx = -1;
    saveSettings();
    document.getElementById('deleteModal').classList.remove('open');
    renderItemList();
    toast('🗑️ Item "' + name + '" dihapus');
  };
  document.getElementById('deleteModal').classList.add('open');
}
function addItem() {
  const name = document.getElementById('newItemName').value.trim();
  const amount = Number(document.getElementById('newItemAmount').value)||0;
  const type = document.getElementById('newItemType').value;
  const kelas = ['7','8','9','calon'].filter(k => document.getElementById('newItemKelas'+k)?.checked);
  if (!name) { toast('⚠️ Nama item tidak boleh kosong!'); return; }
  if (!kelas.length) { toast('⚠️ Pilih minimal 1 kelas!'); return; }
  appState.payItems.push({ id: 'custom_'+Date.now(), name, amount, type, active: true, kelas });
  saveSettings(); renderItemList();
  document.getElementById('newItemName').value='';
  document.getElementById('newItemAmount').value='';
  ['7','8','9'].forEach(k => { const el = document.getElementById('newItemKelas'+k); if(el) el.checked = true; });
  const elCalon = document.getElementById('newItemKelasCalon'); if(elCalon) elCalon.checked = false;
  toast('✅ Item berhasil ditambahkan!');
}

// ── DETAIL MODAL ──
