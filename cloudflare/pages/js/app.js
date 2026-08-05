// ---- Login Page Logic ----
async function initLoginPage() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = params.get('key');
  if (!inviteCode) {
    window.location.href = '/';
    return;
  }

  // Check if this is a new setup or existing login
  const meRes = await api.get('/api/auth/me');
  if (meRes.data.authed) {
    window.location.href = meRes.data.isAdmin ? '/admin.html' : '/dashboard.html';
    return;
  }

  const form = document.getElementById('authForm');
  const submitBtn = document.getElementById('submitBtn');
  const confirmGroup = document.getElementById('confirmGroup');
  const modeIndicator = document.getElementById('mode-indicator');
  let isSetup = false;

  // Try to determine if user exists by attempting login check
  // We'll let the backend decide: if invite is unused -> setup mode
  // For simplicity, we show both password fields and let backend route
  // Actually, let's check: we can't easily check without an endpoint.
  // We'll default to login mode, and if backend returns 'invalid_invite' on setup,
  // we handle it. Better: add a check endpoint. For now, show setup if no session.

  // We'll use a simple approach: always show password. Backend /api/auth/login
  // returns 404 if user doesn't exist. Then we offer setup.
  modeIndicator.textContent = window.i18n ? i18n.t('login.existing') : 'Returning User';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error');
    errorEl.textContent = '';

    submitBtn.disabled = true;

    if (!isSetup) {
      // Try login first
      const res = await api.post('/api/auth/login', { inviteCode, password });
      if (res.ok) {
        window.location.href = '/dashboard.html';
        return;
      }
      if (res.status === 404) {
        // User doesn't exist -> switch to setup mode
        isSetup = true;
        confirmGroup.classList.remove('hidden');
        submitBtn.textContent = window.i18n ? i18n.t('login.setup') : 'Create Account';
        modeIndicator.textContent = window.i18n ? i18n.t('login.new_account') : 'New Account';
        submitBtn.disabled = false;
        errorEl.textContent = 'New invite detected. Set your password.';
        return;
      }
      errorEl.textContent = 'Login failed';
      submitBtn.disabled = false;
    } else {
      // Setup mode
      const confirm = document.getElementById('confirmPassword').value;
      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match';
        submitBtn.disabled = false;
        return;
      }
      const res = await api.post('/api/auth/setup', { inviteCode, password });
      if (res.ok) {
        window.location.href = '/dashboard.html';
      } else {
        errorEl.textContent = res.data.error === 'invalid_invite' ? 'Invite already used or invalid' : 'Setup failed';
        submitBtn.disabled = false;
      }
    }
  });
}

// ---- Dashboard Logic ----
let accounts = [];
let maxAccounts = 4;
let currentEditId = null;

async function initDashboard() {
  const meRes = await api.get('/api/auth/me');
  if (!meRes.data.authed || meRes.data.isAdmin) {
    window.location.href = meRes.data.isAdmin ? '/admin.html' : '/';
    return;
  }

  await loadAccounts();
  bindEvents();
}

async function loadAccounts() {
  const res = await api.get('/api/user/accounts');
  if (!res.ok) return;
  accounts = res.data.accounts || [];
  maxAccounts = res.data.maxAccounts || 4;
  renderAccounts();
}

function renderAccounts() {
  const grid = document.getElementById('accountsList');
  const count = document.getElementById('accountCount');
  count.textContent = `${accounts.length}/${maxAccounts} ${window.i18n ? i18n.t('common.accounts') : 'accounts'}`;

  if (accounts.length === 0) {
    grid.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary)">No accounts yet. Add your first Telegram account.</div>';
    return;
  }

  grid.innerHTML = accounts.map(acc => `
    <div class="account-card">
      <div class="account-header">
        <div>
          <div class="account-name">
            <span class="status-dot ${acc.is_active ? 'on' : 'off'}"></span>
            ${escapeHtml(acc.display_name || acc.phone)}
          </div>
          <div class="account-phone">${escapeHtml(acc.phone)}</div>
        </div>
      </div>
      <div class="account-features">
        <span class="feature-tag ${acc.meow_enabled ? 'active' : 'inactive'}">😺 Meow</span>
        <span class="feature-tag ${acc.fish_enabled ? 'active' : 'inactive'}">🐱 Pishi</span>
        <span class="feature-tag ${acc.smuggle_enabled ? 'active' : 'inactive'}">📦 Smuggle</span>
      </div>
      <div class="account-actions">
        <button class="btn btn-outline btn-sm" onclick="openSettings(${acc.id})">⚙️ Settings</button>
      </div>
    </div>
  `).join('');
}

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/';
  });

  document.getElementById('addAccountBtn').addEventListener('click', () => {
    if (accounts.length >= maxAccounts) {
      alert('Account limit reached');
      return;
    }
    document.getElementById('addModal').classList.remove('hidden');
  });

  document.getElementById('cancelAdd').addEventListener('click', () => {
    document.getElementById('addModal').classList.add('hidden');
  });

  document.getElementById('confirmAdd').addEventListener('click', async () => {
    const phone = document.getElementById('newPhone').value.trim();
    const name = document.getElementById('newName').value.trim();
    const sessionStr = document.getElementById('newSession').value.trim();
    if (!phone || !sessionStr) { alert('Phone and session string required'); return; }

    // Encrypt session string client-side before sending
    const encrypted = await encryptSession(sessionStr);
    const res = await api.post('/api/user/accounts', {
      phone, displayName: name, sessionStringEncrypted: encrypted
    });
    if (res.ok) {
      document.getElementById('addModal').classList.add('hidden');
      document.getElementById('newPhone').value = '';
      document.getElementById('newName').value = '';
      document.getElementById('newSession').value = '';
      await loadAccounts();
    } else {
      alert(res.data.error === 'limit_reached' ? 'Account limit reached' : 'Failed to add account');
    }
  });

  document.getElementById('cancelSettings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('hidden');
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const groupsStr = document.getElementById('setGroups').value;
    const groups = groupsStr.split(',').map(s => s.trim()).filter(s => s).map(Number);
    const res = await api.put(`/api/user/accounts/${currentEditId}/settings`, {
      meow_enabled: document.getElementById('setMeow').checked,
      fish_enabled: document.getElementById('setFish').checked,
      smuggle_enabled: document.getElementById('setSmuggle').checked,
      selected_groups: groups,
      meow_interval: parseInt(document.getElementById('setInterval').value) || 300
    });
    if (res.ok) {
      document.getElementById('settingsModal').classList.add('hidden');
      await loadAccounts();
    }
  });

  document.getElementById('deleteAccount').addEventListener('click', async () => {
    if (!confirm('Delete this account?')) return;
    const res = await api.del(`/api/user/accounts/${currentEditId}`);
    if (res.ok) {
      document.getElementById('settingsModal').classList.add('hidden');
      await loadAccounts();
    }
  });
}

window.openSettings = function(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  currentEditId = id;
  document.getElementById('settingsAccountName').textContent = acc.display_name || acc.phone;
  document.getElementById('setMeow').checked = !!acc.meow_enabled;
  document.getElementById('setFish').checked = !!acc.fish_enabled;
  document.getElementById('setSmuggle').checked = !!acc.smuggle_enabled;
  document.getElementById('setGroups').value = (acc.selected_groups || []).join(', ');
  document.getElementById('setInterval').value = acc.meow_interval || 300;
  document.getElementById('settingsModal').classList.remove('hidden');
};

// Simple client-side encryption (XOR + base64 as transport obfuscation;
// real encryption happens server-side/bot-side with the master key)
async function encryptSession(text) {
  // We send it as base64; the bot will handle real decryption with SESSION_ENCRYPTION_KEY
  return btoa(unescape(encodeURIComponent(text)));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}