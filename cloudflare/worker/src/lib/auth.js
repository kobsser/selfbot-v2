// Session / cookie / auth helpers
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

export async function createSession(db, { userId = null, isAdmin = false } = {}) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await db.run(
    'INSERT INTO sessions (token, user_id, is_admin, expires_at) VALUES (?, ?, ?, ?)',
    token, userId, isAdmin ? 1 : 0, expiresAt
  );
  return { token, maxAge: SESSION_TTL_DAYS * 86400 };
}

export async function getSession(db, request, cookieSecret) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  // Verify token signature (token format: raw.signature)
  const [raw, sig] = token.split('.');
  if (!raw || !sig) return null;
  const valid = await hmacVerify(raw, sig, cookieSecret);
  if (!valid) return null;

  const session = await db.get(
    `SELECT s.token, s.user_id, s.is_admin, s.expires_at
     FROM sessions s WHERE s.token = ?`,
    raw
  );
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    await db.run('DELETE FROM sessions WHERE token = ?', raw);
    return null;
  }
  return { ...session, is_admin: !!session.is_admin, fullToken: token };
}

export function signedToken(raw, signature) {
  return `${raw}.${signature}`;
}

export async function issueSignedSession(db, cookieSecret, opts) {
  const { token, maxAge } = await createSession(db, opts);
  const sig = await hmacSign(token, cookieSecret);
  return { cookieValue: signedToken(token, sig), maxAge };
}