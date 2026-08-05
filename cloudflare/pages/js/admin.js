async function initAdmin() {
  const meRes = await api.get('/api/auth/me');
  if (!meRes.data.authed || !meRes.data.isAdmin) {
    window.location.href = '/';
    return;
  }

  await Promise.all([loadOverview(), loadInvites(), loadJobs()]);
  bindAdminEvents();
}

async function loadOverview() {
  const res = await api.get('/api/admin/overview');
  if (!res.ok) return;
  const { users, settings } = res.data;

  document.getElementById('runHours').value = settings.run_hours || 4;
  document.getElementById('runMinutes').value = settings.run_minutes || 55;
  document.getElementById('maxAccountsGlobal').value = settings.max_accounts_global || 4;
  document.getElementById('meowIntervalDefault').value = settings.meow_interval_default || 300;

  const usersList = document.getElementById('usersList');
  usersList.innerHTML = users.length === 0
    ? '<div class="hint">No users yet</div>'
    : users.map(u => `
      <div class="user-item">
        <div>
          <strong>${escapeHtml(u.invite_code)}</strong>
          <span class="hint">(${u.account_count} accounts)</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" style="width:60px" value="${u.max_accounts || ''}"
            placeholder="∞" data-user-max="${u.id}" title="Per-user max accounts (blank = global)">
          <button class="btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-primary'}"
            onclick="toggleUser(${u.id}, ${!u.is_active})">${u.is_active ? 'Disable' : 'Enable'}</button>
        </div>
      </div>
    `).join('');
}

async function loadInvites() {
  const res = await api.get('/api/admin/invites');
  if (!res.ok) return;
  const list = document.getElementById('invitesList');
  const invites = res.data.invites || [];
  list.innerHTML = invites.length === 0
    ? '<div class="hint">No invites created</div>'
    : invites.map(inv => `
      <div class="invite-item">
        <div>
          <span class="invite-code">${inv.code}</span>
          ${inv.note ? `<span class="hint"> ${escapeHtml(inv.note)}</span>` : ''}
          ${inv.used_by ? '<span class="hint"> (used)</span>' : ''}
        </div>
        <div style="display:flex;gap:6px">
          ${!inv.used_by ? `
            <button class="copy-btn" onclick="copyInvite('${inv.code}')">Copy Link</button>
            <button class="copy-btn" onclick="deleteInvite('${inv.code}')">Delete</button>
          ` : ''}
        </div>
      </div>
    `).join('');
}

async function loadJobs() {
  const res = await api.get('/api/admin/jobs');
  if (!res.ok) return;
  const jobs = res.data.jobs || [];
  const list = document.getElementById('jobsList');
  list.innerHTML = jobs.length === 0
    ? '<div class="hint">No jobs yet</div>'
    : jobs.map(j => `
      <div class="job-item">
        <div>
          <span class="status-badge ${j.status}">${j.status}</span>
          <span class="hint">${j.started_at || ''}</span>
        </div>
        <div class="hint">${j.actions_executed || 0} actions, ${j.accounts_processed || 0} accounts</div>
      </div>
    `).join('');
}

function bindAdminEvents() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/';
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const res = await api.put('/api/admin/settings', {
      run_hours: document.getElementById('runHours').value,
      run_minutes: document.getElementById('runMinutes').value,
      max_accounts_global: document.getElementById('maxAccountsGlobal').value,
      meow_interval_default: document.getElementById('meowIntervalDefault').value
    });
    alert(res.ok ? 'Settings saved' : 'Failed to save');
    // Also save per-user max accounts
    document.querySelectorAll('[data-user-max]').forEach(input => {
      const userId = input.getAttribute('data-user-max');
      const val = input.value.trim();
      api.put(`/api/admin/users/${userId}`, {
        max_accounts: val === '' ? null : parseInt(val)
      });
    });
  });

  document.getElementById('createInvite').addEventListener('click', async () => {
    const note = document.getElementById('inviteNote').value;
    const res = await api.post('/api/admin/invites', { note });
    if (res.ok) {
      document.getElementById('inviteNote').value = '';
      await loadInvites();
    }
  });

  document.getElementById('triggerJob').addEventListener('click', async () => {
    const status = document.getElementById('triggerStatus');
    status.textContent = 'Triggering...';
    const res = await api.post('/api/admin/trigger');
    status.textContent = res.data.ok ? '✅ Job triggered' : `❌ ${res.data.error || 'Failed'}`;
  });

  document.getElementById('refreshJobs').addEventListener('click', loadJobs);
}

window.toggleUser = async function(id, active) {
  await api.put(`/api/admin/users/${id}`, { is_active: active });
  await loadOverview();
};

window.copyInvite = function(code) {
  const workerBase = window.API_BASE;
  const url = `${workerBase}/?key=${code}`;
  navigator.clipboard.writeText(url).then(() => alert('Invite link copied'));
};

window.deleteInvite = async function(code) {
  await api.del(`/api/admin/invites/${encodeURIComponent(code)}`);
  await loadInvites();
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}