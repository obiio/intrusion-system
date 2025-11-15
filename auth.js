// auth.js – REAL AUTH + AUTO PROFILE + IP LOG + LAST LOGIN
let currentUser = null;

// === THEME TOGGLE ===
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

themeToggle.addEventListener('click', () => {
  const isDark = body.getAttribute('data-theme') === 'dark';
  body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeToggle.innerHTML = `<span class="material-icons">${isDark ? 'light_mode' : 'dark_mode'}</span>`;
});

// === TAB SWITCHING ===
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Form').classList.add('active');
  });
});

// === PASSWORD STRENGTH METER ===
document.getElementById('signupPassword').addEventListener('input', (e) => {
  const val = e.target.value;
  const bar = document.querySelector('.password-meter .bar');
  let strength = 0;
  if (val.length >= 8) strength += 25;
  if (/[0-9]/.test(val)) strength += 25;
  if (/[a-z]/.test(val)) strength += 25;
  if (/[A-Z]/.test(val)) strength += 25;
  bar.style.width = strength + '%';
  bar.style.background = strength < 50 ? '#ea4335' : strength < 75 ? '#f9a825' : '#34a853';
});

// === SIGN UP ===
document.getElementById('signupBtn').addEventListener('click', () => {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const role = document.getElementById('signupRole').value;

  if (!name || !email || !password) {
    return showToast('Fill all fields', 'danger');
  }
  if (password.length < 6) {
    return showToast('Password must be 6+ chars', 'danger');
  }

  showToast('Creating account...', 'info');

  auth.createUserWithEmailAndPassword(email, password)
    .then(cred => {
      // Create profile (block admin signup)
      return db.collection('users').doc(cred.user.uid).set({
        displayName: name,
        email: email,
        role: role === 'admin' ? 'user' : role, // Prevent direct admin
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        securityLevel: 1
      });
    })
    .then(() => {
      showToast('Account created! Logging in...', 'success');
    })
    .catch(err => {
      showToast(err.message, 'danger');
    });
});

// === SIGN IN ===
document.getElementById('loginBtn').addEventListener('click', () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    return showToast('Enter email & password', 'danger');
  }

  showToast('Signing in...', 'info');

  auth.signInWithEmailAndPassword(email, password)
    .catch(err => {
      showToast(err.message, 'danger');
    });
});

// === AUTH STATE OBSERVER (ROBUST) ===
auth.onAuthStateChanged(firebaseUser => {
  if (firebaseUser) {
    const userRef = db.collection('users').doc(firebaseUser.uid);

    userRef.get()
      .then(doc => {
        if (doc.exists) {
          // Profile exists → login
          currentUser = { uid: firebaseUser.uid, ...doc.data() };
          updateLastLogin(userRef);
          logAction('User logged in'); // Auto log with IP
          showDashboard(currentUser.role || 'user');
        } else {
          // First login → auto-create profile
          return userRef.set({
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || 'User',
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            securityLevel: 1
          }).then(() => {
            currentUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: 'User',
              role: 'user'
            };
            logAction('First login (profile auto-created)');
            showDashboard('user');
            showToast('Profile created automatically', 'success');
          });
        }
      })
      .catch(err => {
        console.error('Auth error:', err);
        showToast('Network error. Try again.', 'danger');
      });
  } else {
    // Logged out
    currentUser = null;
    document.getElementById('authContainer').classList.add('active');
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('logoutBtn').classList.add('hidden');
  }
});

// === UPDATE LAST LOGIN ===
function updateLastLogin(userRef) {
  userRef.update({
    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(() => {});
}

// === LOGOUT ===
document.getElementById('logoutBtn').addEventListener('click', () => {
  logAction('User logged out');
  auth.signOut().then(() => {
    showToast('Logged out successfully');
  });
});

// === SHOW DASHBOARD BY ROLE ===
function showDashboard(role) {
  document.getElementById('authContainer').classList.remove('active');
  document.getElementById('dashboard').classList.add('active');
  document.getElementById('logoutBtn').classList.remove('hidden');

  // Hide all views
  ['adminView', 'auditorView', 'userView'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  // Show correct view
  const viewId = role + 'View';
  const view = document.getElementById(viewId);
  if (view) {
    view.classList.remove('hidden');
  } else {
    document.getElementById('userView').classList.remove('hidden'); // fallback
  }

  // Init role-specific dashboard
  if (role === 'admin') initAdmin();
  else if (role === 'auditor') initAuditor();
  else initUser(currentUser);
}

// === TOAST (REUSED BY DASHBOARD) ===
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Export for dashboard.js
window.showToast = showToast;