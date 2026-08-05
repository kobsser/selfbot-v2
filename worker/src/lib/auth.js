import { randomHex, hmacSign, hmacVerify } from './crypto.js';

const COOKIE_NAME = 'sb_session';
const SESSION_TTL_DAYS = 30;

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  });
  return out;
}
export function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
export async function getSession(db, request, cookieSecret) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const [raw, sig] = token.split('.');
  if (!raw || !sig) return null;
  if (!(await hmacVerify(raw, sig, cookieSecret))) return null;
  const session = await db.get('SELECT * FROM sessions WHERE token = ?', raw);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await db.run('DELETE FROM sessions WHERE token = ?', raw);
    return null;
  }
  return { ...session, is_admin: !!session.is_admin };
}
export async function issueSignedSession(db, cookieSecret, opts) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await db.run('INSERT INTO sessions (token,user_id,is_admin,expires_at) VALUES (?,?,?,?)',
    token, opts.userId || null, opts.isAdmin ? 1 : 0, expiresAt);
  const sig = await hmacSign(token, cookieSecret);
  return { cookieValue: `${token}.${sig}`, maxAge: SESSION_TTL_DAYS * 86400 };
}
