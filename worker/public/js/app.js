// ---------- LOGIN PAGE ----------
async function initLoginPage(){
  const inviteCode=new URLSearchParams(location.search).get('key');
  if(!inviteCode){location.href='/';return;}
  const me=await api.get('/api/auth/me');
  if(me.data.authed){location.href=me.data.isAdmin?'/admin':'/dashboard';return;}
  let isSetup=false;
  const form=document.getElementById('authForm'),btn=document.getElementById('submitBtn'),
        confirmGroup=document.getElementById('confirmGroup'),mode=document.getElementById('mode-indicator'),
        err=document.getElementById('error');
  mode.textContent=i18n.t('login.existing');
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const password=document.getElementById('password').value;
    err.textContent='';btn.disabled=true;
    if(!isSetup){
      const r=await api.post('/api/auth/login',{inviteCode,password});
      if(r.ok){location.href='/dashboard';return;}
      if(r.status===404){isSetup=true;confirmGroup.classList.remove('hidden');
        btn.textContent=i18n.t('login.setup');mode.textContent=i18n.t('login.new_account');
        btn.disabled=false;err.textContent='New invite detected. Set your password.';return;}
      err.textContent='Login failed';btn.disabled=false;
    }else{
      const confirm=document.getElementById('confirmPassword').value;
      if(password!==confirm){err.textContent='Passwords do not match';btn.disabled=false;return;}
      const r=await api.post('/api/auth/setup',{inviteCode,password});
      if(r.ok)location.href='/dashboard';
      else{err.textContent=r.data.error==='invalid_invite'?'Invite already used':'Setup failed';btn.disabled=false;}
    }
  });
}

// ---------- DASHBOARD ----------
let accounts=[],maxAccounts=4,currentEditId=null;
let loginPollTimer=null,currentLoginId=null;

async function initDashboard(){
  const me=await api.get('/api/auth/me');
  if(!me.data.authed||me.data.isAdmin){location.href=me.data.isAdmin?'/admin':'/';return;}
  await loadAccounts();bindEvents();
}

async function loadAccounts(){
  const r=await api.get('/api/user/accounts');
  if(!r.ok)return;
  accounts=r.data.accounts||[];maxAccounts=r.data.maxAccounts||4;
  renderAccounts();
}

function renderAccounts(){
  const grid=document.getElementById('accountsList');
  document.getElementById('accountCount').textContent=`${accounts.length}/${maxAccounts} ${i18n.t('common.accounts')}`;
  if(!accounts.length){grid.innerHTML='<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary)">No accounts yet. Add your first Telegram account.</div>';return;}
  grid.innerHTML=accounts.map(a=>`
    <div class="account-card">
      <div class="account-header"><div>
        <div class="account-name"><span class="status-dot ${a.is_active?'on':'off'}"></span>${esc(a.display_name||a.phone)}</div>
        <div class="account-phone">${esc(a.phone)}</div></div></div>
      <div class="account-features">
        <span class="feature-tag ${a.meow_enabled?'active':'inactive'}">😺 Meow</span>
        <span class="feature-tag ${a.fish_enabled?'active':'inactive'}">🐱 Pishi</span>
        <span class="feature-tag ${a.smuggle_enabled?'active':'inactive'}">📦 Smuggle</span></div>
      <div class="account-actions"><button class="btn btn-outline btn-sm" onclick="openSettings(${a.id})">⚙️ Settings</button></div>
    </div>`).join('');
}

function bindEvents(){
  document.getElementById('logoutBtn').onclick=async()=>{await api.post('/api/auth/logout');location.href='/';};
  document.getElementById('addAccountBtn').onclick=()=>{
    if(accounts.length>=maxAccounts){alert('Account limit reached');return;}
    openAddAccount();};
  document.getElementById('cancelAdd').onclick=closeAddAccount;
  document.getElementById('btnSendCode').onclick=sendCode;
  document.getElementById('btnSubmitCode').onclick=submitCode;
  document.getElementById('btnSubmitPassword').onclick=submitPassword;
  document.getElementById('cancelSettings').onclick=()=>document.getElementById('settingsModal').classList.add('hidden');
  document.getElementById('saveSettings').onclick=async()=>{
    const groups=document.getElementById('setGroups').value.split(',').map(s=>s.trim()).filter(Boolean).map(Number);
    const r=await api.put(`/api/user/accounts/${currentEditId}/settings`,{
      meow_enabled:document.getElementById('setMeow').checked,
      fish_enabled:document.getElementById('setFish').checked,
      smuggle_enabled:document.getElementById('setSmuggle').checked,
      selected_groups:groups,meow_interval:parseInt(document.getElementById('setInterval').value)||300});
    if(r.ok){document.getElementById('settingsModal').classList.add('hidden');await loadAccounts();}};
  document.getElementById('deleteAccount').onclick=async()=>{
    if(!confirm('Delete this account?'))return;
    const r=await api.del(`/api/user/accounts/${currentEditId}`);
    if(r.ok){document.getElementById('settingsModal').classList.add('hidden');await loadAccounts();}};
}

// ---------- ADD ACCOUNT (phone/code/password) ----------
function openAddAccount(){
  currentLoginId=null;stopLoginPolling();
  showStep('stepPhone');
  ['loginPhone','loginCode','loginPassword'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('loginStatus').textContent='';
  document.getElementById('loginError').textContent='';
  document.getElementById('addModal').classList.remove('hidden');
}
function closeAddAccount(){
  if(currentLoginId)api.post('/api/login/cancel',{login_id:currentLoginId});
  stopLoginPolling();
  document.getElementById('addModal').classList.add('hidden');
}
function showStep(id){['stepPhone','stepCode','stepPassword'].forEach(s=>
  document.getElementById(s).classList.toggle('hidden',s!==id));}
function stopLoginPolling(){if(loginPollTimer){clearInterval(loginPollTimer);loginPollTimer=null;}}

async function sendCode(){
  const phone=document.getElementById('loginPhone').value.trim();
  const status=document.getElementById('loginStatus'),err=document.getElementById('loginError');
  if(!phone)return;
  err.textContent='';status.textContent=i18n.t('login_flow.starting');
  const r=await api.post('/api/login/start',{phone});
  if(!r.ok){err.textContent=r.data.error==='limit_reached'?'Account limit reached':'Failed to start';status.textContent='';return;}
  currentLoginId=r.data.login_id;
  status.textContent=i18n.t('login_flow.sending');
  startLoginPolling();
}
function startLoginPolling(){stopLoginPolling();loginPollTimer=setInterval(pollLoginStatus,2000);pollLoginStatus();}
async function pollLoginStatus(){
  if(!currentLoginId)return;
  const r=await api.get(`/api/login/status?login_id=${currentLoginId}`);
  if(!r.ok)return;
  const{status,error}=r.data;
  const sEl=document.getElementById('loginStatus'),eEl=document.getElementById('loginError');
  switch(status){
    case'pending':case'sending_code':sEl.textContent=i18n.t('login_flow.sending');break;
    case'waiting_code':showStep('stepCode');sEl.textContent=i18n.t('login_flow.code_sent');break;
    case'waiting_password':showStep('stepPassword');sEl.textContent=i18n.t('login_flow.password_needed');break;
    case'done':stopLoginPolling();sEl.textContent=i18n.t('login_flow.success');
      setTimeout(async()=>{document.getElementById('addModal').classList.add('hidden');await loadAccounts();},800);break;
    case'failed':case'expired':case'cancelled':stopLoginPolling();showStep('stepPhone');
      eEl.textContent=error||'Login failed';sEl.textContent='';break;
  }
}
async function submitCode(){
  const code=document.getElementById('loginCode').value.trim();
  if(!code||!currentLoginId)return;
  document.getElementById('loginStatus').textContent=i18n.t('login_flow.verifying');
  const r=await api.post('/api/login/code',{login_id:currentLoginId,code});
  if(!r.ok)document.getElementById('loginError').textContent=r.data.error||'Failed';
}
async function submitPassword(){
  const password=document.getElementById('loginPassword').value;
  if(!password||!currentLoginId)return;
  document.getElementById('loginStatus').textContent=i18n.t('login_flow.verifying');
  const r=await api.post('/api/login/password',{login_id:currentLoginId,password});
  if(!r.ok)document.getElementById('loginError').textContent=r.data.error||'Failed';
}

window.openSettings=function(id){
  const a=accounts.find(x=>x.id===id);if(!a)return;
  currentEditId=id;
  document.getElementById('settingsAccountName').textContent=a.display_name||a.phone;
  document.getElementById('setMeow').checked=!!a.meow_enabled;
  document.getElementById('setFish').checked=!!a.fish_enabled;
  document.getElementById('setSmuggle').checked=!!a.smuggle_enabled;
  document.getElementById('setGroups').value=(a.selected_groups||[]).join(', ');
  document.getElementById('setInterval').value=a.meow_interval||300;
  document.getElementById('settingsModal').classList.remove('hidden');
};
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
