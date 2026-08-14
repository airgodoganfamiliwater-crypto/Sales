// ===== Firebase init =====
const firebaseConfig = {
  apiKey: "AIzaSyCl13_a4x-BQnWNUjf9JOQX1DKc-HxLBys",
  authDomain: "klien-39696.firebaseapp.com",
  projectId: "klien-39696"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ===== Custom alert system =====
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

  if (duration > 0) {
    setTimeout(() => dismissAlert(alertEl), duration);
  }

  return alertEl;
}

function dismissAlert(alertEl) {
  if (!alertEl || !alertEl.parentNode) return;
  alertEl.classList.add('leaving');
  setTimeout(() => alertEl.remove(), 180);
}

// ===== Firebase error message mapping (Indonesian) =====
function mapAuthError(error) {
  const code = error.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/user-disabled':
      return 'Akun ini telah dinonaktifkan. Hubungi admin.';
    case 'auth/user-not-found':
      return 'Email tidak terdaftar.';
    case 'auth/wrong-password':
      return 'Kata sandi yang kamu masukkan salah.';
    case 'auth/invalid-credential':
      return 'Email atau kata sandi salah.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
    case 'auth/network-request-failed':
      return 'Koneksi bermasalah. Periksa jaringan kamu.';
    default:
      return 'Gagal masuk. Silakan coba lagi.';
  }
}

// Show a one-time message if we were redirected here (e.g. inactive account)
(function showRedirectMessageIfAny() {
  try {
    const msg = sessionStorage.getItem('loginRedirectMessage');
    if (msg) {
      showAlert(msg, 'error');
      sessionStorage.removeItem('loginRedirectMessage');
    }
  } catch (e) {
    // sessionStorage unavailable — skip silently
  }
})();

// ===== Form elements =====
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const togglePass = document.getElementById('togglePass');

// Show/hide password
togglePass.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePass.setAttribute('aria-label', isPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
});

// Clear invalid state on typing
[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => input.classList.remove('invalid'));
});

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('loading', isLoading);
}

function validate() {
  let valid = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    emailInput.classList.add('invalid');
    valid = false;
  }
  if (!password) {
    passwordInput.classList.add('invalid');
    valid = false;
  }
  return valid;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validate()) {
    showAlert('Mohon lengkapi email dan kata sandi dengan benar.', 'error');
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  setLoading(true);

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showAlert('Berhasil masuk. Mengalihkan...', 'success', 1500);
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 700);
  } catch (error) {
    setLoading(false);
    showAlert(mapAuthError(error), 'error');
  }
});

// If already logged in, skip straight to index.html
auth.onAuthStateChanged((user) => {
  if (user) {
    window.location.href = 'index.html';
  }
});
