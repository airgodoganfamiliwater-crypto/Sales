// ===== Firebase init =====
const firebaseConfig = {
  apiKey: "AIzaSyCl13_a4x-BQnWNUjf9JOQX1DKc-HxLBys",
  authDomain: "klien-39696.firebaseapp.com",
  projectId: "klien-39696"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
window.db = db;

// ===== Custom alert system (shared across all views) =====
const alertContainer = document.getElementById('alertContainer');

function showAlert(message, type = 'info', duration = 4000) {
  const alertEl = document.createElement('div');
  alertEl.className = `alert ${type}`;

  const icon = document.createElement('div');
  icon.className = 'alert-icon';
  icon.textContent = type === 'error' ? '!' : type === 'success' ? '✓' : 'i';

  const text = document.createElement('div');
  text.className = 'alert-text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'alert-close';
  closeBtn.setAttribute('aria-label', 'Tutup notifikasi');
  closeBtn.textContent = '×';
  closeBtn.onclick = () => dismissAlert(alertEl);

  alertEl.appendChild(icon);
  alertEl.appendChild(text);
  alertEl.appendChild(closeBtn);
  alertContainer.appendChild(alertEl);

  if (duration > 0) setTimeout(() => dismissAlert(alertEl), duration);
  return alertEl;
}

function dismissAlert(alertEl) {
  if (!alertEl || !alertEl.parentNode) return;
  alertEl.classList.add('leaving');
  setTimeout(() => alertEl.remove(), 180);
}

window.showAlert = showAlert;

// ===== Router / view switcher =====
const VIEWS = ['home', 'input', 'customer', 'riwayat', 'saldohutang', 'profile', 'laporan'];
const NAV_VIEWS = ['home', 'customer', 'riwayat']; // views represented in the bottom nav
const DEFAULT_VIEW = 'home';

const VIEW_META = {
  home: { title: 'Home', eyebrow: 'Pendataan Lapangan' },
  input: { title: 'Input Data', eyebrow: 'Tambah Data Baru' },
  customer: { title: 'Customer', eyebrow: 'Data Pelanggan' },
  riwayat: { title: 'Riwayat', eyebrow: 'Aktivitas Sebelumnya' },
  saldohutang: { title: 'Saldo & Hutang', eyebrow: 'Ringkasan Piutang', backTo: 'home' },
  profile: { title: 'Profil', eyebrow: 'Akun & Pengaturan', backTo: 'home' },
  laporan: { title: 'Laporan', eyebrow: 'Riwayat Perbulan', backTo: 'home' }
};

const topbarTitle = document.getElementById('topbarTitle');
const topbarEyebrow = document.getElementById('topbarEyebrow');
const topbarEl = document.querySelector('.topbar');
const viewContainer = document.getElementById('viewContainer');

let currentView = null;

function getViewFromHash() {
  const hash = window.location.hash.replace('#', '');
  return VIEWS.includes(hash) ? hash : DEFAULT_VIEW;
}

function switchView(viewName) {
  if (!VIEWS.includes(viewName)) viewName = DEFAULT_VIEW;
  if (viewName === currentView) return;

  // Toggle view sections
  VIEWS.forEach((name) => {
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.toggle('active', name === viewName);
  });

  // Toggle nav item active state
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Toggle FAB active state
  const fab = document.getElementById('fabInput');
  if (fab) fab.classList.toggle('active', viewName === 'input');

  // Hide the bottom nav + FAB for any view that isn't one of the 3 main tabs
  const isTabView = NAV_VIEWS.includes(viewName);
  const nav = document.querySelector('.bottom-nav');
  if (nav) nav.classList.toggle('nav-hidden', !isTabView);
  if (fab) fab.classList.toggle('fab-hidden', !isTabView);

  // Update topbar
  const meta = VIEW_META[viewName];
  if (meta) {
    topbarTitle.textContent = meta.title;
    topbarEyebrow.textContent = meta.eyebrow;
  }

  const hideTopbar = viewName === 'home' || viewName === 'profile';
  if (topbarEl) topbarEl.classList.toggle('topbar-hidden', hideTopbar);
  if (viewContainer) viewContainer.classList.toggle('no-topbar', hideTopbar);

  // Show/hide the back button for views that define a backTo target
  const backBtn = document.getElementById('topbarBackBtn');
  if (backBtn) {
    backBtn.hidden = !(meta && meta.backTo);
    backBtn.dataset.backTo = (meta && meta.backTo) || '';
  }

  // Reset scroll position
  viewContainer.scrollTop = 0;

  const previousView = currentView;
  currentView = viewName;

  // Lifecycle hooks per view (defined in views/*.js as window.<Name>View)
  const hookName = viewName.charAt(0).toUpperCase() + viewName.slice(1) + 'View';
  if (previousView) {
    const prevHookName = previousView.charAt(0).toUpperCase() + previousView.slice(1) + 'View';
    const prevHook = window[prevHookName];
    if (prevHook && typeof prevHook.onLeave === 'function') prevHook.onLeave();
  }
  const hook = window[hookName];
  if (hook && typeof hook.onEnter === 'function') hook.onEnter();
}

function navigateTo(viewName) {
  if (window.location.hash === `#${viewName}`) {
    switchView(viewName);
  } else {
    window.location.hash = viewName;
  }
}

window.addEventListener('hashchange', () => switchView(getViewFromHash()));

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.view));
});

document.getElementById('fabInput').addEventListener('click', () => navigateTo('input'));

document.getElementById('topbarBackBtn').addEventListener('click', (e) => {
  const target = e.currentTarget.dataset.backTo;
  if (target) navigateTo(target);
});

// Generic delegated navigation for any in-view element (quick actions,
// "lihat semua" links, etc.) — just add data-nav="viewName" to a button.
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-nav]');
  if (target) navigateTo(target.dataset.nav);
});

// ===== Logout confirm dialog (opened from the Profile view's logout button) =====
document.getElementById('logoutConfirmCancel').addEventListener('click', () => {
  document.getElementById('logoutConfirmOverlay').classList.remove('open');
});

document.getElementById('logoutConfirmOk').addEventListener('click', async () => {
  document.getElementById('logoutConfirmOverlay').classList.remove('open');
  try {
    await auth.signOut();
    window.location.href = 'login.html';
  } catch (error) {
    showAlert('Gagal keluar. Silakan coba lagi.', 'error');
  }
});

// ===== Auth guard =====
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // App is ready — initialize router once auth state is confirmed
  switchView(getViewFromHash());
});
