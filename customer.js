
let customerUnsubscribe = null;
let customerCache = [];
let customerUIBound = false;

let photoBase64 = null;
let pickedLat = null;
let pickedLng = null;
let map = null;
let marker = null;
let locationMapOpen = false;
let skipNextGeolocate = false;
let myIdCabangCache = null;
let editingCustomerId = null;

let selectionMode = false;
let selectedIds = new Set();
let longPressTimer = null;
const LONG_PRESS_MS = 500;

window.CustomerView = {
  onEnter() {
    bindCustomerUI();
    startCustomerListener();
  },

  onLeave() {
    if (customerUnsubscribe) {
      customerUnsubscribe();
      customerUnsubscribe = null;
    }
  }
};

function bindCustomerUI() {
  if (customerUIBound) return;
  customerUIBound = true;

  document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerSheet());
  document.getElementById('customerSheetClose').addEventListener('click', () => closeCustomerSheet());
  document.getElementById('customerSheetOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'customerSheetOverlay') closeCustomerSheet();
  });
  document.getElementById('customerForm').addEventListener('submit', handleAddCustomer);
  document.getElementById('customerSearch').addEventListener('input', () => renderCustomerList(customerCache));

  enableSheetDrag(
    document.querySelector('#customerSheetOverlay .sheet'),
    closeCustomerSheet
  );

  // ---- Photo card / action sheet ----
  document.getElementById('photoCard').addEventListener('click', openPhotoSheet);
  document.getElementById('photoCancelBtn').addEventListener('click', closePhotoSheet);
  document.getElementById('photoSheetOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'photoSheetOverlay') closePhotoSheet();
  });
  document.getElementById('photoTakeBtn').addEventListener('click', () => {
    closePhotoSheet();
    document.getElementById('photoInputCamera').click();
  });
  document.getElementById('photoGalleryBtn').addEventListener('click', () => {
    closePhotoSheet();
    document.getElementById('photoInputGallery').click();
  });
  document.getElementById('photoInputCamera').addEventListener('change', handlePhotoFile);
  document.getElementById('photoInputGallery').addEventListener('change', handlePhotoFile);

  // ---- Location picker ----
  document.getElementById('pickLocationBtn').addEventListener('click', toggleLocationMap);

  // ---- Customer list: tap to edit, long-press to select ----
  const listEl = document.getElementById('customerList');
  listEl.addEventListener('click', handleListClick);
  listEl.addEventListener('touchstart', handleListTouchStart, { passive: true });
  listEl.addEventListener('touchmove', clearLongPressTimer);
  listEl.addEventListener('touchend', clearLongPressTimer);

  document.getElementById('selectionCancelBtn').addEventListener('click', exitSelectionMode);
  document.getElementById('selectionDeleteBtn').addEventListener('click', openDeleteConfirm);
  document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
  document.getElementById('deleteConfirmOk').addEventListener('click', confirmDeleteSelected);
  document.getElementById('deleteConfirmOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'deleteConfirmOverlay') closeDeleteConfirm();
  });
}

/* ================= Drag-to-close ================= */

function enableSheetDrag(sheetEl, onClose) {
  let startY = 0;
  let deltaY = 0;
  let dragging = false;
  let ignoreDrag = false;

  const onStart = (e) => {
    ignoreDrag = !!e.target.closest('.no-sheet-drag');
    if (ignoreDrag) return;

    startY = e.touches[0].clientY;
    deltaY = 0;
    dragging = false;
  };

  const onMove = (e) => {
    if (ignoreDrag) return;

    if (!dragging) {
      const d = e.touches[0].clientY - startY;
      // Only start dragging the sheet closed when pulling down AND the
      // sheet's own content is already scrolled to the top.
      if (d > 0 && sheetEl.scrollTop <= 0) {
        dragging = true;
        startY = e.touches[0].clientY; // reset baseline to avoid a jump
        deltaY = 0;
        sheetEl.classList.add('dragging');
      }
      return; // still scrolling normally — don't interfere
    }

    const d = e.touches[0].clientY - startY;
    deltaY = Math.max(0, d);
    sheetEl.style.transform = `translateY(${deltaY}px)`;
    // Stop the pull-to-refresh / body scroll gesture while dragging the sheet
    e.preventDefault();
  };

  const onEnd = () => {
    if (dragging) {
      sheetEl.classList.remove('dragging');
      sheetEl.style.transform = '';
      if (deltaY > 110) onClose();
    }
    dragging = false;
    deltaY = 0;
  };

  sheetEl.addEventListener('touchstart', onStart, { passive: true });
  sheetEl.addEventListener('touchmove', onMove, { passive: false });
  sheetEl.addEventListener('touchend', onEnd);
  sheetEl.addEventListener('touchcancel', onEnd);
}

/* ================= Add-customer sheet ================= */

function openCustomerSheet() {
  document.getElementById('customerSheetOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCustomerSheet() {
  document.getElementById('customerSheetOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('customerForm').reset();

  photoBase64 = null;
  document.getElementById('photoCardPreview').hidden = true;
  document.getElementById('photoCardPreview').src = '';
  document.getElementById('photoCardEmpty').hidden = false;

  pickedLat = null;
  pickedLng = null;
  document.getElementById('pickLocationBtn').classList.remove('picked');
  document.getElementById('locationBtnLabel').textContent = 'Ambil lokasi';
  document.getElementById('locationMapCard').hidden = true;
  locationMapOpen = false;

  editingCustomerId = null;
  document.getElementById('customerSheetTitle').textContent = 'Tambah Pelanggan';
  document.querySelector('#custSubmitBtn .btn-label').textContent = 'Simpan Pelanggan';
}

/* ================= Photo: action sheet + compression ================= */

function openPhotoSheet() {
  document.getElementById('photoSheetOverlay').classList.add('open');
}

function closePhotoSheet() {
  document.getElementById('photoSheetOverlay').classList.remove('open');
}

async function handlePhotoFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  try {
    const compressed = await compressImage(file);
    photoBase64 = compressed;

    const previewEl = document.getElementById('photoCardPreview');
    const emptyEl = document.getElementById('photoCardEmpty');
    previewEl.src = compressed;
    previewEl.hidden = false;
    emptyEl.hidden = true;
  } catch (err) {
    showAlert('Gagal memproses foto. Coba lagi.', 'error');
  }
}

function compressImage(file, maxDimension = 1000, startQuality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height >= width && height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        let quality = startQuality;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Shrink further if still large, but never below a floor quality
        // (keeps it "sekecil mungkin tapi tidak pecah").
        while (dataUrl.length > 700 * 1024 * 1.37 && quality > 0.35) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

/* ================= Location: inline Leaflet map ================= */

function toggleLocationMap() {
  const card = document.getElementById('locationMapCard');
  const label = document.getElementById('locationBtnLabel');

  // Already open — clicking again just collapses it, keeps the picked point
  if (locationMapOpen) {
    card.hidden = true;
    locationMapOpen = false;
    return;
  }

  card.hidden = false;
  locationMapOpen = true;

  setTimeout(() => {
    if (typeof L === 'undefined') {
      showAlert('Peta gagal dimuat. Periksa koneksi internet kamu.', 'error');
      card.hidden = true;
      locationMapOpen = false;
      return;
    }

    if (!map) {
      map = L.map('locationMap', { attributionControl: false, zoomControl: false })
        .setView([-6.2, 106.8], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'location-marker-icon',
        html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22s8-6.5 8-13a8 8 0 1 0-16 0c0 6.5 8 13 8 13Z" fill="#2563eb" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="9" r="3" fill="white"/>
        </svg>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30]
      });

      // A real marker tied to a lat/lng — it moves with the map when you pan,
      // and can be dragged directly to fine-tune the exact point.
      marker = L.marker(map.getCenter(), { draggable: true, icon: pinIcon }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        pickedLat = pos.lat;
        pickedLng = pos.lng;
        document.getElementById('pickLocationBtn').classList.add('picked');
        label.textContent = 'Lokasi diambil';
      });
    }

    map.invalidateSize();

    const applyPosition = (lat, lng, zoom) => {
      map.setView([lat, lng], zoom);
      marker.setLatLng([lat, lng]);
      map.invalidateSize();
    };

    // Editing a customer that already has a saved point — show that instead
    // of overwriting it with the device's current GPS position.
    if (skipNextGeolocate && pickedLat != null && pickedLng != null) {
      skipNextGeolocate = false;
      applyPosition(pickedLat, pickedLng, 16);
      label.textContent = 'Lokasi diambil';
      return;
    }

    label.textContent = 'Mencari lokasi...';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyPosition(pos.coords.latitude, pos.coords.longitude, 16);
          pickedLat = pos.coords.latitude;
          pickedLng = pos.coords.longitude;
          document.getElementById('pickLocationBtn').classList.add('picked');
          label.textContent = 'Lokasi diambil';
        },
        () => {
          applyPosition(-6.2, 106.8, 12);
          label.textContent = 'Ambil lokasi';
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      applyPosition(-6.2, 106.8, 12);
      label.textContent = 'Ambil lokasi';
    }
  }, 50);
}

/* ================= Card tap → edit / long-press → select ================= */

function handleListTouchStart(e) {
  const card = e.target.closest('.customer-card');
  if (!card) return;

  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    enterSelectionMode();
    toggleCardSelection(card.dataset.id);
  }, LONG_PRESS_MS);
}

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleListClick(e) {
  const card = e.target.closest('.customer-card');
  if (!card) return;

  // Ignore taps on the phone-call shortcut
  if (e.target.closest('.customer-call')) return;

  if (selectionMode) {
    toggleCardSelection(card.dataset.id);
    return;
  }

  openEditCustomerSheet(card.dataset.id);
}

function enterSelectionMode() {
  if (selectionMode) return;
  selectionMode = true;
  selectedIds.clear();
  document.getElementById('customerList').classList.add('selecting');
  document.getElementById('customerToolbar').hidden = true;
  document.getElementById('selectionBar').hidden = false;
  updateSelectionCount();
}

function exitSelectionMode() {
  selectionMode = false;
  selectedIds.clear();
  document.getElementById('customerList').classList.remove('selecting');
  document.getElementById('customerToolbar').hidden = false;
  document.getElementById('selectionBar').hidden = true;
  renderCustomerList(customerCache);
}

function toggleCardSelection(id) {
  const card = document.querySelector(`.customer-card[data-id="${id}"]`);
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    if (card) card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    if (card) card.classList.add('selected');
  }
  updateSelectionCount();
}

function updateSelectionCount() {
  document.getElementById('selectionCount').textContent = `${selectedIds.size} dipilih`;
}

/* ================= Delete confirmation ================= */

function openDeleteConfirm() {
  if (selectedIds.size === 0) return;
  document.getElementById('deleteConfirmDesc').textContent =
    `${selectedIds.size} pelanggan yang dipilih akan dihapus permanen dan tidak bisa dikembalikan.`;
  document.getElementById('deleteConfirmOverlay').classList.add('open');
}

function closeDeleteConfirm() {
  document.getElementById('deleteConfirmOverlay').classList.remove('open');
}

async function confirmDeleteSelected() {
  const ids = Array.from(selectedIds);
  closeDeleteConfirm();

  try {
    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection('customers').doc(id)));
    await batch.commit();
    showAlert('Pelanggan terpilih berhasil dihapus.', 'success');
  } catch (error) {
    showAlert('Gagal menghapus data. Coba lagi.', 'error');
  } finally {
    exitSelectionMode();
  }
}

/* ================= Edit customer (opens the same sheet, pre-filled) ================= */

function openEditCustomerSheet(id) {
  const customer = customerCache.find((c) => c.id === id);
  if (!customer) return;

  editingCustomerId = id;

  document.getElementById('custName').value = customer.namaPelanggan || '';
  document.getElementById('custPhone').value = customer.noTelepon || '';
  document.getElementById('custAddress').value = customer.alamat || '';
  document.getElementById('custGalon').value = customer.jumlahGalon || '';
  document.getElementById('custHarga').value = customer.harga || 8000;

  if (customer.fotoPelanggan) {
    photoBase64 = customer.fotoPelanggan;
    const previewEl = document.getElementById('photoCardPreview');
    previewEl.src = customer.fotoPelanggan;
    previewEl.hidden = false;
    document.getElementById('photoCardEmpty').hidden = true;
  }

  if (customer.lokasiPelanggan) {
    pickedLat = customer.lokasiPelanggan.lat;
    pickedLng = customer.lokasiPelanggan.lng;
    skipNextGeolocate = true;
    document.getElementById('pickLocationBtn').classList.add('picked');
    document.getElementById('locationBtnLabel').textContent = 'Lokasi diambil';
  }

  document.getElementById('customerSheetTitle').textContent = 'Edit Pelanggan';
  document.querySelector('#custSubmitBtn .btn-label').textContent = 'Update Pelanggan';

  openCustomerSheet();
}

/* ================= Firestore: list + create ================= */
function startCustomerListener() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (customerUnsubscribe) customerUnsubscribe();

  customerUnsubscribe = db.collection('customers')
    .where('pemilik', '==', user.uid)
    .onSnapshot((snapshot) => {
      customerCache = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      customerCache.sort((a, b) => (a.namaPelanggan || '').localeCompare(b.namaPelanggan || ''));
      renderCustomerList(customerCache);
    }, () => {
      showAlert('Gagal memuat data pelanggan.', 'error');
    });
}

async function getMyIdCabang(uid) {
  if (myIdCabangCache !== null) return myIdCabangCache;
  const snap = await db.collection('users').doc(uid).get();
  myIdCabangCache = snap.exists ? (snap.data().idCabang || null) : null;
  return myIdCabangCache;
}

async function handleAddCustomer(e) {
  e.preventDefault();

  const user = firebase.auth().currentUser;
  if (!user) {
    showAlert('Sesi kamu berakhir. Silakan masuk kembali.', 'error');
    return;
  }

  const namaPelanggan = document.getElementById('custName').value.trim();
  const noTelepon = document.getElementById('custPhone').value.trim();
  const alamat = document.getElementById('custAddress').value.trim();
  const jumlahGalon = Number(document.getElementById('custGalon').value);
  const harga = Number(document.getElementById('custHarga').value) || 0;
  const submitBtn = document.getElementById('custSubmitBtn');

  if (!namaPelanggan) {
    showAlert('Nama pelanggan wajib diisi.', 'error');
    return;
  }
  if (!jumlahGalon || jumlahGalon <= 0) {
    showAlert('Jumlah galon wajib diisi.', 'error');
    return;
  }
  if (pickedLat == null || pickedLng == null) {
    showAlert('Ambil lokasi pelanggan terlebih dahulu.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const idCabang = await getMyIdCabang(user.uid);

    const payload = {
      namaPelanggan,
      noTelepon,
      alamat,
      jumlahGalon,
      harga,
      fotoPelanggan: photoBase64 || null,
      lokasiPelanggan: { lat: pickedLat, lng: pickedLng },
      idCabang: idCabang || null,
      pemilik: user.uid,
      status: true
    };

    if (editingCustomerId) {
      await db.collection('customers').doc(editingCustomerId).update(payload);
      showAlert('Pelanggan berhasil diperbarui.', 'success');
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('customers').add(payload);
      showAlert('Pelanggan berhasil ditambahkan.', 'success');
    }

    closeCustomerSheet();
  } catch (error) {
    showAlert('Gagal menyimpan data. Coba lagi.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/* ================= Rendering ================= */

function renderCustomerList(customers) {
  const listEl = document.getElementById('customerList');
  const query = (document.getElementById('customerSearch').value || '').trim().toLowerCase();

  const filtered = query
    ? customers.filter((c) =>
        (c.namaPelanggan || '').toLowerCase().includes(query) ||
        (c.noTelepon || '').toLowerCase().includes(query))
    : customers;

  if (filtered.length === 0) {
    listEl.innerHTML = customers.length === 0
      ? emptyStateHTML('Belum ada pelanggan', 'Tambahkan pelanggan pertama kamu lewat tombol + di atas.')
      : emptyStateHTML('Tidak ditemukan', 'Coba kata kunci pencarian lain.');
    return;
  }

  listEl.innerHTML = filtered.map(customerCardHTML).join('');

  if (selectionMode) {
    selectedIds.forEach((id) => {
      const card = listEl.querySelector(`.customer-card[data-id="${id}"]`);
      if (card) card.classList.add('selected');
    });
  }
}

function emptyStateHTML(title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      </div>
      <p class="empty-title">${escapeHTML(title)}</p>
      <p class="empty-desc">${escapeHTML(desc)}</p>
    </div>`;
}

function customerCardHTML(customer) {
  const initial = (customer.namaPelanggan || '?').trim().charAt(0) || '?';
  const phone = customer.noTelepon || '';
  const galonInfo = customer.jumlahGalon ? `${customer.jumlahGalon} galon` : '';
  const meta = [galonInfo, phone].filter(Boolean).join(' · ') || (customer.alamat || 'Belum ada detail');

  const avatar = customer.fotoPelanggan
    ? `<img class="customer-avatar customer-avatar-photo" src="${escapeAttr(customer.fotoPelanggan)}" alt="">`
    : `<div class="customer-avatar">${escapeHTML(initial)}</div>`;

  const hutang = customer.hutang || 0;
  const saldo = customer.saldo || 0;
  let badge = '';
  if (hutang > 0) {
    badge = `<span class="sh-amount hutang customer-badge">Hutang ${escapeHTML(formatRupiah(hutang))}</span>`;
  } else if (saldo > 0) {
    badge = `<span class="sh-amount saldo customer-badge">Saldo ${escapeHTML(formatRupiah(saldo))}</span>`;
  }

  return `
    <div class="customer-card" data-id="${customer.id}">
      <div class="customer-check" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 13l4 4L19 7" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      ${avatar}
      <div class="customer-info">
        <p class="customer-name">${escapeHTML(customer.namaPelanggan || 'Tanpa nama')}</p>
        <p class="customer-meta">${escapeHTML(meta)}</p>
        ${badge}
      </div>
      ${phone ? `<a class="customer-call" href="tel:${escapeAttr(phone)}" aria-label="Telepon">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>` : ''}
    </div>`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}