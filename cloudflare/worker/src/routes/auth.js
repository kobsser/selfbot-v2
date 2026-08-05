import { hashPassword, randomHex } from '../lib/crypto.js';
import { issueSignedSession, sessionCookie, clearCookie } from '../lib/auth.js';
import { json } from '../index.js';

export async function handleAuth(db, env, url, request) {
  const path = url.pathname;
  const body = await request.json().catch(() => ({}));

  // POST /api/auth/setup  (invite code + password -> create user)
  if (path === '/api/auth/setup' && request.method === 'POST') {
    const { inviteCode, password } = body;
    if (!inviteCode || !password || password.length < 6) {
      return json({ error: 'invalid' }, 400);
    }
    const invite = await db.get('SELECT * FROM invites WHERE code = ?', inviteCode);
    if (!invite || invite.used_by) return json({ error: 'invalid_invite' }, 404);

    const salt = randomHex(16);
    const hash = await hashPassword(password, salt);
    const res = await db.run(
      'INSERT INTO users (invite_code, password_hash, salt) VALUES (?, ?, ?)',
      inviteCode, hash, salt
    );
    const userId = res.meta.last_row_id;
    await db.run('UPDATE invites SET used_by = ?, used_at = datetime("now") WHERE code = ?', userId, inviteCode);

    const { cookieValue, maxAge } = await issueSignedSession(db, env.COOKIE_SECRET, { userId });
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(cookieValue, maxAge) });
  }

  // POST /api/auth/login (invite code + password -> session)
  if (path === '/api/auth/login' && request.method === 'POST') {
    const { inviteCode, password } = body;
    const user = await db.get('SELECT * FROM users WHERE invite_code = ?', inviteCode);
    if (!user || !user.is_active) return json({ error: 'invalid' }, 404);

    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) return json({ error: 'invalid' }, 404);

    const { cookieValue, maxAge } = await issueSignedSession(db, env.COOKIE_SECRET, { userId: user.id });
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(cookieValue, maxAge) });
  }

  // POST /api/auth/admin (admin password -> admin session)
  if (path === '/api/auth/admin' && request.method === 'POST') {
    const { param, password } = body;
    if (param !== env.ADMIN_PARAM) return json({ error: 'invalid' }, 404);
    if (password !== env.ADMIN_PASSWORD) return json({ error: 'invalid' }, 404);

    const { cookieValue, maxAge } = await issueSignedSession(db, env.COOKIE_SECRET, { isAdmin: true });
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(cookieValue, maxAge) });
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && request.method === 'GET') {
    const { getSession } = await import('../lib/auth.js');
    const session = await getSession(db, request, env.COOKIE_SECRET);
    if (!session) return json({ authed: false }, 200);
    if (session.is_admin) return json({ authed: true, isAdmin: true }, 200);
    const user = await db.get('SELECT id, invite_code, max_accounts FROM users WHERE id = ?', session.user_id);
    return json({ authed: true, isAdmin: false, user }, 200);
  }

  return json({ error: 'not_found' }, 404);
}