import { getAuthContextState, getAuthRole, clearAuthContextState } from '../projectStorage.js';
import { mountPersistentNavigation } from './components/navigation.js';

const ROLE_OPTIONS = ['read-only', 'reviewer', 'engineer', 'admin'];

function authHeaders() {
  const { token, csrfToken } = getAuthContextState() ?? {};
  return {
    Authorization: `Bearer ${token}`,
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
  };
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function shortHash(hash) {
  if (!hash || typeof hash !== 'string') return '—';
  return hash.slice(0, 12) + '…';
}

// ── Users table ────────────────────────────────────────────────────────────

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Loading…</td></tr>';
  try {
    const res = await fetch('/api/v1/admin/users', {
      headers: { Authorization: authHeaders().Authorization },
    });
    if (res.status === 403) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty table-error">Access denied. Admin role required.</td></tr>';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { users } = await res.json();
    renderUsersTable(users);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty table-error">Failed to load users: ${err.message}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No users found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const user of users) {
    const tr = document.createElement('tr');

    const roleSelect = document.createElement('select');
    roleSelect.className = 'input-sm';
    roleSelect.setAttribute('aria-label', `Role for ${user.username}`);
    for (const r of ROLE_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === user.role) opt.selected = true;
      roleSelect.appendChild(opt);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm';
    saveBtn.textContent = 'Save';
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => confirmRoleChange(user.username, roleSelect.value));

    tr.innerHTML = `
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.email ?? '—')}</td>
      <td class="role-cell"></td>
      <td>${user.oidc ? '<span class="badge badge-info">SSO</span>' : '<span class="badge">Password</span>'}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td>${formatDate(user.lastLogin)}</td>
      <td class="actions-cell"></td>
    `;
    tr.querySelector('.role-cell').appendChild(roleSelect);
    tr.querySelector('.actions-cell').appendChild(saveBtn);
    tbody.appendChild(tr);
  }
}

async function confirmRoleChange(username, newRole) {
  const confirmed = await showModal(
    'Change Role',
    `Set ${username}'s role to "${newRole}"?`
  );
  if (!confirmed) return;
  try {
    const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(username)}/role`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(`Failed to update role: ${body.error ?? res.status}`);
      return;
    }
    await loadUsers();
  } catch (err) {
    showError(`Error updating role: ${err.message}`);
  }
}

// ── Audit Log table ────────────────────────────────────────────────────────

let lastAuditEntries = [];

async function loadAuditLog() {
  const tbody = document.getElementById('audit-tbody');
  const countEl = document.getElementById('audit-count');
  tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Loading…</td></tr>';
  countEl.textContent = '';

  const params = new URLSearchParams();
  const actor = document.getElementById('filter-actor').value.trim();
  const action = document.getElementById('filter-action').value;
  const entityType = document.getElementById('filter-entity-type').value.trim();
  const limit = Number(document.getElementById('filter-limit').value) || 100;
  if (actor) params.set('actor', actor);
  if (action) params.set('action', action);
  if (entityType) params.set('entityType', entityType);
  params.set('limit', String(Math.min(limit, 500)));

  try {
    const res = await fetch(`/api/v1/admin/audit-log?${params}`, {
      headers: { Authorization: authHeaders().Authorization },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { entries, total } = await res.json();
    lastAuditEntries = entries;
    renderAuditTable(entries);
    countEl.textContent = `Showing ${entries.length} of ${total} entries`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty table-error">Failed to load audit log: ${err.message}</td></tr>`;
  }
}

function renderAuditTable(entries) {
  const tbody = document.getElementById('audit-tbody');
  if (!entries || entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No entries match the current filters.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const e of [...entries].reverse()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(formatDate(e.ts))}</td>
      <td>${escapeHtml(e.actor ?? '—')}</td>
      <td><span class="badge badge-action">${escapeHtml(e.action ?? '—')}</span></td>
      <td>${escapeHtml(e.entityType ?? '—')}</td>
      <td>${escapeHtml(e.entityId ?? '—')}</td>
      <td>${escapeHtml(e.projectId ?? '—')}</td>
      <td class="hash-cell" title="${escapeHtml(e.reqHash ?? '')}">${escapeHtml(shortHash(e.reqHash))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportAuditCsv() {
  if (!lastAuditEntries.length) {
    showError('Load audit log entries first.');
    return;
  }
  const headers = ['id', 'ts', 'actor', 'action', 'entityType', 'entityId', 'projectId', 'reqHash'];
  const rows = lastAuditEntries.map(e =>
    headers.map(h => JSON.stringify(e[h] ?? '')).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal helper ───────────────────────────────────────────────────────────

function showModal(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = message;
    overlay.classList.remove('hidden');
    overlay.querySelector('#modal-confirm').focus();

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    function cleanup() {
      overlay.classList.add('hidden');
      document.getElementById('modal-confirm').removeEventListener('click', onConfirm);
      document.getElementById('modal-cancel').removeEventListener('click', onCancel);
    }

    document.getElementById('modal-confirm').addEventListener('click', onConfirm);
    document.getElementById('modal-cancel').addEventListener('click', onCancel);
  });
}

function showError(message) {
  // Reuse the modal as a simple alert
  showModal('Error', message).catch(() => {});
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  mountPersistentNavigation();

  const authState = getAuthContextState();
  const accessCheck = document.getElementById('admin-access-check');
  const adminContent = document.getElementById('admin-content');

  if (!authState?.token) {
    accessCheck.innerHTML = '<p class="table-error">You must be signed in to access the admin panel. <a href="login.html">Sign in</a></p>';
    return;
  }

  const role = getAuthRole();
  if (role !== 'admin') {
    accessCheck.innerHTML = '<p class="table-error">Admin role required. Your current role is: ' + escapeHtml(role ?? 'unknown') + '</p>';
    return;
  }

  accessCheck.classList.add('hidden');
  adminContent.classList.remove('hidden');

  document.getElementById('refresh-users-btn').addEventListener('click', loadUsers);
  document.getElementById('load-audit-btn').addEventListener('click', loadAuditLog);
  document.getElementById('export-audit-btn').addEventListener('click', exportAuditCsv);

  await loadUsers();
}

init();
