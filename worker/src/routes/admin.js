import { randomHex } from '../lib/crypto.js';
import { dispatch } from '../lib/github.js';
import { json } from '../lib/response.js';

export async function handleAdmin(db, env, url, request, session) {
  if (!session.is_admin) return json({ error: 'forbidden' }, 403);
  const path = url.pathname;

  if (path === '/api/admin/overview' && request.method === 'GET') {
    const users = await db.all(`
      SELECT u.id, u.invite_code, u.max_accounts, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM accounts a WHERE a.user_id=u.id) AS account_count
      FROM users u`);
    const settings = {};
    (await db.all('SELECT key,value FROM settings')).forEach(r => settings[r.key] = r.value);
    const running = await db.get(`SELECT id FROM job_runs WHERE status='running' LIMIT 1`);
    return json({ users, settings, jobRunning: !!running });
  }

  if (path === '/api/admin/invites' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const code = 'INV_' + randomHex(6);
    await db.run('INSERT INTO invites (code,note) VALUES (?,?)', code, body.note || '');
    return json({ code });
  }

  if (path === '/api/admin/invites' && request.method === 'GET')
    return json({ invites: await db.all('SELECT * FROM invites ORDER BY created_at DESC') });

  const invDel = path.match(/^\/api\/admin\/invites\/(.+)$/);
  if (invDel && request.method === 'DELETE') {
    await db.run('DELETE FROM invites WHERE code=? AND used_by IS NULL', decodeURIComponent(invDel[1]));
    return json({ ok: true });
  }

  if (path === '/api/admin/settings' && request.method === 'PUT') {
    const body = await request.json();
    for (const [k, v] of Object.entries(body)) await db.setSetting(k, v);
    return json({ ok: true });
  }

  const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && request.method === 'PUT') {
    const userId = parseInt(userMatch[1]);
    const body = await request.json();
    if (body.max_accounts !== undefined)
      await db.run('UPDATE users SET max_accounts=? WHERE id=?',
        body.max_accounts === null ? null : parseInt(body.max_accounts), userId);
    if (body.is_active !== undefined)
      await db.run('UPDATE users SET is_active=? WHERE id=?', body.is_active?1:0, userId);
    return json({ ok: true });
  }

  if (path === '/api/admin/jobs' && request.method === 'GET')
    return json({ jobs: await db.all('SELECT * FROM job_runs ORDER BY id DESC LIMIT 50') });

  if (path === '/api/admin/trigger' && request.method === 'POST') {
    const result = await dispatch(env, 'run-selfbot', { triggered_by: 'admin' });
    return json(result);
  }

  return json({ error: 'not_found' }, 404);
}
