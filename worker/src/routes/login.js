import { randomHex } from '../lib/crypto.js';
import { dispatch } from '../lib/github.js';
import { json } from '../lib/response.js';

// User-facing login flow (cookie auth)
export async function handleLogin(db, env, url, request, session) {
  const path = url.pathname;
  const userId = session.user_id;
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/api/login/start' && request.method === 'POST') {
    const phone = (body.phone || '').trim();
    if (!phone) return json({ error: 'phone_required' }, 400);

    const max = await db.getMaxAccountsForUser(userId);
    const count = await db.get('SELECT COUNT(*) c FROM accounts WHERE user_id=?', userId);
    if (count.c >= max) return json({ error: 'limit_reached' }, 403);

    const login_id = 'lg_' + randomHex(12);
    await db.run('INSERT INTO login_sessions (id,user_id,phone,status) VALUES (?,?,?,?)',
      login_id, userId, phone, 'pending');

    const dr = await dispatch(env, 'login-request', { login_id, phone });
    if (!dr.ok) {
      await db.run(`UPDATE login_sessions SET status='failed', error='Failed to dispatch login worker' WHERE id=?`, login_id);
      return json({ error: 'dispatch_failed' }, 500);
    }
    await db.run(`UPDATE login_sessions SET status='sending_code' WHERE id=?`, login_id);
    return json({ login_id });
  }

  async function own(login_id) {
    return db.get('SELECT * FROM login_sessions WHERE id=? AND user_id=?', login_id, userId);
  }

  if (path === '/api/login/status' && request.method === 'GET') {
    const ls = await own(url.searchParams.get('login_id'));
    if (!ls) return json({ error: 'not_found' }, 404);
    return json({ status: ls.status, error: ls.error, account_id: ls.account_id });
  }

  if (path === '/api/login/code' && request.method === 'POST') {
    const ls = await own(body.login_id);
    if (!ls) return json({ error: 'not_found' }, 404);
    await db.run(`UPDATE login_sessions SET submitted_code=?, updated_at=datetime('now') WHERE id=?`,
      (body.code || '').trim(), body.login_id);
    return json({ ok: true });
  }

  if (path === '/api/login/password' && request.method === 'POST') {
    const ls = await own(body.login_id);
    if (!ls) return json({ error: 'not_found' }, 404);
    await db.run(`UPDATE login_sessions SET submitted_password=?, updated_at=datetime('now') WHERE id=?`,
      body.password || '', body.login_id);
    return json({ ok: true });
  }

  if (path === '/api/login/cancel' && request.method === 'POST') {
    const ls = await own(body.login_id);
    if (ls && !['done', 'failed'].includes(ls.status)) {
      await db.run(`UPDATE login_sessions SET status='cancelled' WHERE id=?`, body.login_id);
    }
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

// Bot-facing login endpoints (X-Bot-Key auth)
export async function handleBotLogin(db, env, url, request) {
  const path = url.pathname;
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};

  if (path === '/api/bot/login/update' && request.method === 'POST') {
    const { login_id, status, phone_code_hash, error } = body;
    if (!login_id || !status) return json({ error: 'missing_fields' }, 400);
    await db.run(
      `UPDATE login_sessions SET status=?, phone_code_hash=COALESCE(?,phone_code_hash),
       error=COALESCE(?,error), updated_at=datetime('now') WHERE id=?`,
      status, phone_code_hash || null, error || null, login_id);
    return json({ ok: true });
  }

  if (path === '/api/bot/login/poll' && request.method === 'GET') {
    const login_id = url.searchParams.get('login_id');
    if (!login_id) return json({ error: 'missing_login_id' }, 400);
    const ls = await db.get('SELECT * FROM login_sessions WHERE id=?', login_id);
    if (!ls) return json({ error: 'not_found' }, 404);
    return json({
      status: ls.status,
      submitted_code: ls.submitted_code,
      submitted_password: ls.submitted_password
    });
  }

  if (path === '/api/bot/login/complete' && request.method === 'POST') {
    const { login_id, encrypted_session, phone, display_name } = body;
    if (!login_id || !encrypted_session) return json({ error: 'missing_fields' }, 400);

    const ls = await db.get('SELECT * FROM login_sessions WHERE id=?', login_id);
    if (!ls) return json({ error: 'not_found' }, 404);
    const userId = ls.user_id;

    const max = await db.getMaxAccountsForUser(userId);
    const count = await db.get('SELECT COUNT(*) c FROM accounts WHERE user_id=?', userId);
    if (count.c >= max) {
      await db.run(`UPDATE login_sessions SET status='failed', error='Account limit reached' WHERE id=?`, login_id);
      return json({ error: 'limit_reached' }, 403);
    }

    const res = await db.run(
      'INSERT INTO accounts (user_id,phone,display_name,session_string_encrypted) VALUES (?,?,?,?)',
      userId, phone || ls.phone, display_name || phone || ls.phone, encrypted_session);
    const accountId = res.meta.last_row_id;
    await db.run('INSERT INTO account_settings (account_id) VALUES (?)', accountId);
    await db.run(`UPDATE login_sessions SET status='done', account_id=? WHERE id=?`, accountId, login_id);
    return json({ ok: true, account_id: accountId });
  }

  return json({ error: 'not_found', path }, 404);
}