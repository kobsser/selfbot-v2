async function initAdmin(){
  const me=await api.get('/api/auth/me');
  if(!me.data.authed||!me.data.isAdmin){location.href='/';return;}
  await Promise.all([loadOverview(),loadInvites(),loadJobs()]);bind();
}
async function loadOverview(){
  const r=await api.get('/api/admin/overview');if(!r.ok)return;
  const{users,settings}=r.data;
  document.getElementById('runHours').value=settings.run_hours||4;
  document.getElementById('runMinutes').value=settings.run_minutes||55;
  document.getElementById('maxAccountsGlobal').value=settings.max_accounts_global||4;
  document.getElementById('meowIntervalDefault').value=settings.meow_interval_default||300;
  document.getElementById('usersList').innerHTML=users.length?users.map(u=>`
    <div class="user-item"><div><strong>${esc(u.invite_code)}</strong> <span class="hint">(${u.account_count} accounts)</span></div>
    <div style="display:flex;gap:8px;align-items:center">
      <input type="number" style="width:60px" value="${u.max_accounts||''}" placeholder="∞" data-user-max="${u.id}" title="Per-user max (blank = global)">
      <button class="btn btn-sm ${u.is_active?'btn-outline':'btn-primary'}" onclick="toggleUser(${u.id},${!u.is_active})">${u.is_active?'Disable':'Enable'}</button>
    </div></div>`).join(''):'<div class="hint">No users yet</div>';
}
async function loadInvites(){
  const r=await api.get('/api/admin/invites');if(!r.ok)return;
  const invites=r.data.invites||[];
  document.getElementById('invitesList').innerHTML=invites.length?invites.map(i=>`
    <div class="invite-item"><div><span class="invite-code">${i.code}</span>
      ${i.note?` <span class="hint">${esc(i.note)}</span>`:''}${i.used_by?' <span class="hint">(used)</span>':''}</div>
    <div style="display:flex;gap:6px">${!i.used_by?`
      <button class="copy-btn" onclick="copyInvite('${i.code}')">Copy Link</button>
      <button class="copy-btn" onclick="deleteInvite('${i.code}')">Delete</button>`:''}</div></div>`).join(''):'<div class="hint">No invites created</div>';
}
async function loadJobs(){
  const r=await api.get('/api/admin/jobs');if(!r.ok)return;
  const jobs=r.data.jobs||[];
  document.getElementById('jobsList').innerHTML=jobs.length?jobs.map(j=>`
    <div class="job-item"><div><span class="status-badge ${j.status}">${j.status}</span> <span class="hint">${j.started_at||''}</span></div>
    <div class="hint">${j.actions_executed||0} actions, ${j.accounts_processed||0} accounts</div></div>`).join(''):'<div class="hint">No jobs yet</div>';
}
function bind(){
  document.getElementById('logoutBtn').onclick=async()=>{await api.post('/api/auth/logout');location.href='/';};
  document.getElementById('saveSettings').onclick=async()=>{
    await api.put('/api/admin/settings',{
      run_hours:document.getElementById('runHours').value,
      run_minutes:document.getElementById('runMinutes').value,
      max_accounts_global:document.getElementById('maxAccountsGlobal').value,
      meow_interval_default:document.getElementById('meowIntervalDefault').value});
    document.querySelectorAll('[data-user-max]').forEach(inp=>{
      const v=inp.value.trim();
      api.put(`/api/admin/users/${inp.getAttribute('data-user-max')}`,{max_accounts:v===''?null:parseInt(v)});});
    alert('Settings saved');};
  document.getElementById('createInvite').onclick=async()=>{
    const r=await api.post('/api/admin/invites',{note:document.getElementById('inviteNote').value});
    if(r.ok){document.getElementById('inviteNote').value='';await loadInvites();}};
  document.getElementById('triggerJob').onclick=async()=>{
    const s=document.getElementById('triggerStatus');s.textContent='Triggering...';
    const r=await api.post('/api/admin/trigger');
    s.textContent=r.data.ok?'✅ Job triggered':`❌ ${r.data.error||'Failed'}`;};
  document.getElementById('refreshJobs').onclick=loadJobs;
}
window.toggleUser=async(id,active)=>{await api.put(`/api/admin/users/${id}`,{is_active:active});await loadOverview();};
window.copyInvite=code=>navigator.clipboard.writeText(`${location.origin}/?key=${code}`).then(()=>alert('Invite link copied'));
window.deleteInvite=async code=>{await api.del(`/api/admin/invites/${encodeURIComponent(code)}`);await loadInvites();};
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
