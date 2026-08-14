// ===== Profile view =====
// - Profile photo stored ONLY in IndexedDB (never Firestore/Storage).
// - Simple pan+zoom crop tool, output as a compressed square JPEG.
// - Dark/light theme toggle using the existing CSS custom properties.
// - Logout with a custom confirm dialog (no native confirm()).

let profileUIBound = false;

const PROFILE_DB_NAME = 'salesAppProfile';
const PROFILE_DB_STORE = 'photo';
const PROFILE_PHOTO_KEY = 'avatar';

window.ProfileView = {
  onEnter() {
    bindProfileUI();
    renderAccountInfo();
    loadProfilePhoto();
  },
  onLeave() {}
};

/* ================= IndexedDB helpers ================= */

function openProfileDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROFILE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PROFILE_DB_STORE)) {
        req.result.createObjectStore(PROFILE_DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveProfilePhotoToIDB(dataUrl) {
  const idb = await openProfileDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(PROFILE_DB_STORE, 'readwrite');
    tx.objectStore(PROFILE_DB_STORE).put(dataUrl, PROFILE_PHOTO_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getProfilePhotoFromIDB() {
  const idb = await openProfileDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(PROFILE_DB_STORE, 'readonly');
    const req = tx.objectStore(PROFILE_DB_STORE).get(PROFILE_PHOTO_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteProfilePhotoFromIDB() {
  const idb = await openProfileDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(PROFILE_DB_STORE, 'readwrite');
    tx.objectStore(PROFILE_DB_STORE).delete(PROFILE_PHOTO_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadProfilePhoto() {
  try {
    const dataUrl = await getProfilePhotoFromIDB();
    setProfilePhotoDisplay(dataUrl);
  } catch (error) {
    console.error('Gagal memuat foto profil:', error);
  }
}

function setProfilePhotoDisplay(dataUrl) {
  const img = document.getElementById('profilePhotoImg');
  const empty = document.getElementById('profilePhotoEmpty');
  if (dataUrl) {
    img.src = dataUrl;
    img.hidden = false;
    empty.hidden = true;
  } else {
    img.hidden = true;
    img.src = '';
    empty.hidden = false;
  }
}

/* ================= UI binding ================= */

function bindProfileUI() {
  if (profileUIBound) return;
  profileUIBound = true;

  document.getElementById('profilePhotoBtn').addEventListener('click', openProfilePhotoSheet);
  document.getElementById('profilePhotoCancelBtn').addEventListener('click', closeProfilePhotoSheet);
  document.getElementById('profilePhotoSheetOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'profilePhotoSheetOverlay') closeProfilePhotoSheet();
  });

  document.getElementById('profilePhotoChangeBtn').addEventListener('click', () => {
    closeProfilePhotoSheet();
    document.getElementById('profilePhotoFileInput').click();
  });

  document.getElementById('profilePhotoDeleteBtn').addEventListener('click', handleDeleteProfilePhoto);
  document.getElementById('profilePhotoFileInput').addEventListener('change', handleProfilePhotoSelected);

  // Crop controls
  document.getElementById('cropCancelBtn').addEventListener('click', closeCropOverlay);
  document.getElementById('cropSaveBtn').addEventListener('click', handleCropSave);
  document.getElementById('cropZoomSlider').addEventListener('input', handleCropZoomChange);
  bindCropDrag();

  // Dark mode toggle
  const darkToggle = document.getElementById('darkModeToggle');
  darkToggle.checked = document.documentElement.classList.contains('dark');
  darkToggle.addEventListener('change', () => {
    applyTheme(darkToggle.checked);
  });

  // Logout — the confirm/cancel handlers are bound globally in index.js
  // (shared with the topbar logout button), this just opens the dialog.
  document.getElementById('profileLogoutBtn').addEventListener('click', () => {
    document.getElementById('logoutConfirmOverlay').classList.add('open');
  });
}

function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  } catch (e) {
    // localStorage unavailable — theme just won't persist across reloads
  }
}

/* ================= Account info card ================= */

async function renderAccountInfo() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  document.getElementById('profileEmail').textContent = user.email || '-';

  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const data = snap.exists ? snap.data() : {};

    document.getElementById('profileName').textContent = data.name || (user.email ? user.email.split('@')[0] : '-');
    document.getElementById('profileRole').textContent = data.role || '-';
    document.getElementById('profileStatus').textContent = data.status ? 'Aktif' : 'Nonaktif';
  } catch (error) {
    console.error('Gagal memuat info akun:', error);
  }
}

/* ================= Photo source action sheet ================= */

function openProfilePhotoSheet() {
  document.getElementById('profilePhotoSheetOverlay').classList.add('open');
}

function closeProfilePhotoSheet() {
  document.getElementById('profilePhotoSheetOverlay').classList.remove('open');
}

async function handleDeleteProfilePhoto() {
  closeProfilePhotoSheet();
  try {
    await deleteProfilePhotoFromIDB();
    setProfilePhotoDisplay(null);
    showAlert('Foto profil dihapus.', 'success');
  } catch (error) {
    showAlert('Gagal menghapus foto.', 'error');
  }
}

/* ================= Crop tool ================= */

let cropImgEl = null;
let cropStageSize = 260;
let cropNaturalW = 0;
let cropNaturalH = 0;
let cropBaseScale = 1;
let cropScale = 1;
let cropLeft = 0;
let cropTop = 0;
let cropDragging = false;
let cropDragStartX = 0;
let cropDragStartY = 0;
let cropStartLeft = 0;
let cropStartTop = 0;

function handleProfilePhotoSelected(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      cropNaturalW = img.naturalWidth;
      cropNaturalH = img.naturalHeight;
      cropBaseScale = cropStageSize / Math.min(cropNaturalW, cropNaturalH);
      cropScale = cropBaseScale;

      cropImgEl = document.getElementById('cropImage');
      cropImgEl.src = ev.target.result;

      document.getElementById('cropZoomSlider').value = 100;
      applyCropTransform(true);
      openCropOverlay();
    };
    img.onerror = () => showAlert('Gagal memuat gambar.', 'error');
    img.src = ev.target.result;
  };
  reader.onerror = () => showAlert('Gagal membaca file.', 'error');
  reader.readAsDataURL(file);
}

function openCropOverlay() {
  document.getElementById('profileCropOverlay').classList.add('open');
}

function closeCropOverlay() {
  document.getElementById('profileCropOverlay').classList.remove('open');
}

function applyCropTransform(recenter) {
  const width = cropNaturalW * cropScale;
  const height = cropNaturalH * cropScale;

  if (recenter) {
    cropLeft = (cropStageSize - width) / 2;
    cropTop = (cropStageSize - height) / 2;
  }

  clampCropPosition(width, height);

  cropImgEl.style.width = `${width}px`;
  cropImgEl.style.height = `${height}px`;
  cropImgEl.style.transform = `translate(${cropLeft}px, ${cropTop}px)`;
}

function clampCropPosition(width, height) {
  cropLeft = Math.min(0, Math.max(cropStageSize - width, cropLeft));
  cropTop = Math.min(0, Math.max(cropStageSize - height, cropTop));
}

function handleCropZoomChange(e) {
  const pct = Number(e.target.value) || 100;
  cropScale = cropBaseScale * (pct / 100);
  applyCropTransform(false);
}

function bindCropDrag() {
  const stage = document.getElementById('cropStage');

  const onStart = (e) => {
    cropDragging = true;
    const point = e.touches ? e.touches[0] : e;
    cropDragStartX = point.clientX;
    cropDragStartY = point.clientY;
    cropStartLeft = cropLeft;
    cropStartTop = cropTop;
  };

  const onMove = (e) => {
    if (!cropDragging) return;
    const point = e.touches ? e.touches[0] : e;
    cropLeft = cropStartLeft + (point.clientX - cropDragStartX);
    cropTop = cropStartTop + (point.clientY - cropDragStartY);
    applyCropTransform(false);
    if (e.cancelable) e.preventDefault();
  };

  const onEnd = () => {
    cropDragging = false;
  };

  stage.addEventListener('touchstart', onStart, { passive: true });
  stage.addEventListener('touchmove', onMove, { passive: false });
  stage.addEventListener('touchend', onEnd);
  stage.addEventListener('touchcancel', onEnd);

  stage.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
}

async function handleCropSave() {
  const outputSize = 320;
  const visibleNaturalSize = cropStageSize / cropScale;
  const visibleNaturalX = -cropLeft / cropScale;
  const visibleNaturalY = -cropTop / cropScale;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    cropImgEl,
    visibleNaturalX, visibleNaturalY, visibleNaturalSize, visibleNaturalSize,
    0, 0, outputSize, outputSize
  );

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  try {
    await saveProfilePhotoToIDB(dataUrl);
    setProfilePhotoDisplay(dataUrl);
    closeCropOverlay();
    showAlert('Foto profil berhasil disimpan.', 'success');
  } catch (error) {
    showAlert('Gagal menyimpan foto.', 'error');
  }
}