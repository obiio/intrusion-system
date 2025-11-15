// dashboard.js – AUTO IP + LOGGING + CSV EXPORT + REAL DATA
let userIP = null;
let unsub = { users: null, audits: null, blacklist: null, logs: null };

// === FETCH USER'S REAL IP (FREE, NO API KEY) ===
async function fetchUserIP() {
  if (userIP) return userIP;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    userIP = data.ip || 'unknown';
  } catch (e) {
    console.warn('IP fetch failed:', e);
    userIP = 'unknown';
  }
  return userIP;
}

// === AUTO LOG WITH IP ===
async function logAction(action) {
  if (!currentUser) return;
  await fetchUserIP();
  db.collection('logs').add({
    userId: currentUser.uid,
    email: currentUser.email,
    action: action,
    ip: userIP,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => console.warn('Log failed:', err));
}

// ============= ADMIN DASHBOARD =============
function initAdmin() {
  fetchUserIP();
  logAction('Admin accessed dashboard');
  loadAdminOverview();
  loadAuditRequestsTable();
  loadBlacklistTable();
  loadSystemLogsTable();

  // Real-time updates
  unsub.audits = db.collection('auditRequests').onSnapshot(() => loadAuditRequestsTable());
  unsub.blacklist = db.collection('blacklist').onSnapshot(() => loadBlacklistTable());
}

function loadAdminOverview() {
  const updateCount = (query, id) => {
    query.onSnapshot(snap => {
      document.getElementById(id).textContent = snap.size;
    });
  };
  updateCount(db.collection('users'), 'activeUsers');
  updateCount(db.collection('auditRequests').where('status', '==', 'pending'), 'intrusions');
  updateCount(db.collection('blacklist'), 'blacklistCount');
}

// --- Audit Requests Table + CSV ---
function loadAuditRequestsTable() {
  const container = document.querySelector('#adminView .card:nth-of-type(3)');
  const table = document.getElementById('auditTable');
  if (!container.querySelector('.export-btn')) {
    const btn = document.createElement('button');
    btn.className = 'btn-sm export-btn';
    btn.innerHTML = 'Export CSV';
    btn.onclick = () => exportTableToCSV('auditTable', 'audit_requests');
    container.querySelector('h3').appendChild(btn);
  }

  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading...</td></tr>';

  db.collection('auditRequests')
    .orderBy('createdAt', 'desc')
    .get()
    .then(snap => renderTable(tbody, snap, [
      d => escapeHtml(d.email),
      d => d.ip || '—',
      d => formatDate(d.createdAt),
      d => `<span class="badge ${d.status}">${d.status}</span>`,
      d => escapeHtml(d.reason || '').substring(0, 50) + (d.reason?.length > 50 ? '...' : ''),
      d => `
        ${d.status === 'pending' ? `<button class="btn-sm approve" onclick="approveAudit('${doc.id}')">Approve</button>` : ''}
        <button class="btn-sm block" onclick="blockIP('${d.ip}', '${doc.id}')">Block</button>
      `
    ]));
}

window.approveAudit = (id) => {
  logAction('Approved audit request');
  db.collection('auditRequests').doc(id).update({
    status: 'approved',
    approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    approvedBy: currentUser.email
  }).then(() => showToast('Audit approved', 'success'));
};

window.blockIP = (ip, reqId) => {
  if (!ip || ip === '—') return showToast('No IP to block', 'danger');
  logAction(`Blocked IP: ${ip}`);
  const batch = db.batch();
  const blRef = db.collection('blacklist').doc(ip);
  batch.set(blRef, {
    ip,
    reason: 'Flagged via audit',
    blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
    blockedBy: currentUser.email
  }, { merge: true });
  if (reqId) batch.update(db.collection('auditRequests').doc(reqId), { status: 'blocked' });
  batch.commit().then(() => showToast(`${ip} blacklisted`, 'success'));
};

// --- Blacklist Table + CSV ---
function loadBlacklistTable() {
  const container = document.querySelector('#adminView .card:nth-of-type(4)');
  const table = document.getElementById('blacklistTable');
  if (!container.querySelector('.export-btn')) {
    const btn = document.createElement('button');
    btn.className = 'btn-sm export-btn';
    btn.innerHTML = 'Export CSV';
    btn.onclick = () => exportTableToCSV('blacklistTable', 'blacklisted_ips');
    container.querySelector('h3').appendChild(btn);
  }

  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading...</td></tr>';

  db.collection('blacklist')
    .orderBy('blockedAt', 'desc')
    .get()
    .then(snap => renderTable(tbody, snap, [
      d => d.ip,
      d => escapeHtml(d.reason),
      d => formatDate(d.blockedAt),
      d => `<button class="btn-sm unblock" onclick="unblockIP('${d.ip}')">Unblock</button>`
    ]));
}

window.unblockIP = (ip) => {
  logAction(`Unblocked IP: ${ip}`);
  db.collection('blacklist').doc(ip).delete().then(() => showToast(`${ip} unblocked`, 'success'));
};

// --- System Logs Table + CSV ---
function loadSystemLogsTable() {
  const container = document.getElementById('adminView');
  let card = container.querySelector('#systemLogsCard');
  if (!card) {
    card = document.createElement('div');
    card.id = 'systemLogsCard';
    card.className = 'card';
    card.innerHTML = `
      <h3>System Activity Log
        <button class="btn-sm export-btn" onclick="exportTableToCSV('systemLogsTable', 'system_logs')">Export CSV</button>
      </h3>
      <table id="systemLogsTable">
        <thead><tr><th>User</th><th>Action</th><th>IP</th><th>Time</th></tr></thead>
        <tbody></tbody>
      </table>
    `;
    container.appendChild(card);
  }

  const tbody = card.querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Loading...</td></tr>';

  db.collection('logs')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .onSnapshot(snap => renderTable(tbody, snap, [
      d => escapeHtml(d.email),
      d => escapeHtml(d.action),
      d => d.ip || '—',
      d => formatDate(d.timestamp)
    ]));
}

// ============= AUDITOR DASHBOARD =============
function initAuditor() {
  fetchUserIP();
  logAction('Auditor accessed dashboard');
  document.getElementById('requestAuditBtn').onclick = () => {
    const email = document.getElementById('auditUserEmail').value.trim();
    if (!email) return showToast('Enter email', 'danger');
    logAction(`Auditor searched: ${email}`);
    loadAuditLogsTable(email);
  };
}

function loadAuditLogsTable(email) {
  const container = document.getElementById('logViewer');
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h4>Activity Log: <strong>${escapeHtml(email)}</strong></h4>
      <button class="btn-sm export-btn" onclick="exportTableToCSV('auditLogTable', 'audit_${email.split('@')[0]}')">Export CSV</button>
    </div>
    <table id="auditLogTable" class="log-table">
      <thead><tr><th>Action</th><th>IP</th><th>Time</th></tr></thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = container.querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="loading">Loading...</td></tr>';

  db.collection('logs')
    .where('email', '==', email)
    .orderBy('timestamp', 'desc')
    .limit(200)
    .get()
    .then(snap => renderTable(tbody, snap, [
      d => escapeHtml(d.action),
      d => d.ip || '—',
      d => formatDate(d.timestamp)
    ]));
}

// ============= USER DASHBOARD =============
function initUser(user) {
  fetchUserIP();
  logAction('User accessed dashboard');
  document.getElementById('userEmail').textContent = user.email;
  const badge = document.getElementById('userRoleBadge');
  badge.textContent = user.role;
  badge.className = `badge ${user.role}`;
  document.getElementById('lastLogin').textContent = user.lastLogin ? formatDate(user.lastLogin) : 'First login';

  loadUserActivityTable(user.uid);
  document.getElementById('viewMyLogs').onclick = () => {
    logAction('User viewed own logs');
    loadUserActivityTable(user.uid);
  };
}

function loadUserActivityTable(uid) {
  const container = document.getElementById('myLogs');
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h4>Your Activity Log</h4>
      <button class="btn-sm export-btn" onclick="exportTableToCSV('userLogTable', 'my_activity')">Export CSV</button>
    </div>
    <table id="userLogTable" class="log-table">
      <thead><tr><th>Action</th><th>IP</th><th>Time</th></tr></thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = container.querySelector('tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="loading">Loading...</td></tr>';

  unsub.logs = db.collection('logs')
    .where('userId', '==', uid)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .onSnapshot(snap => renderTable(tbody, snap, [
      d => escapeHtml(d.action),
      d => d.ip || '—',
      d => formatDate(d.timestamp)
    ]));
}

// ============= CSV EXPORT FUNCTION =============
function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  const rows = table.querySelectorAll('tr');
  let csv = [];

  rows.forEach(row => {
    const cells = row.querySelectorAll('th, td');
    const rowData = Array.from(cells).map(cell => {
      let text = (cell.innerText || cell.textContent).trim();
      text = text.replace(/"/g, '""');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        text = `"${text}"`;
      }
      return text;
    });
    csv.push(rowData.join(','));
  });

  const csvContent = csv.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV exported!', 'success');
}

// ============= TABLE RENDERER =============
function renderTable(tbody, snap, formatters) {
  tbody.innerHTML = '';
  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="10">No data available</td></tr>';
    return;
  }
  snap.forEach(doc => {
    const d = doc.data();
    const tr = document.createElement('tr');
    tr.innerHTML = formatters.map(f => `<td>${f(d, doc)}</td>`).join('');
    tbody.appendChild(tr);
  });
}

// ============= UTILS =============
function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts.toDate()).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Global functions
window.showToast = showToast;
window.exportTableToCSV = exportTableToCSV;