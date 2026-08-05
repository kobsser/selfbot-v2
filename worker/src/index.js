import { DB } from './lib/db.js';
import { getSession } from './lib/auth.js';
import { isJobRunning, dispatch } from './lib/github.js';
import { json } from './lib/response.js';
import { handleAuth } from './routes/auth.js';
import { handleUser } from './routes/user.js';
import { handleAdmin } from './routes/admin.js';
import { handleBot } from './routes/bot.js';
import { handleLogin } from './routes/login.js';

// Re-export for any other consumers
export { json };

function serveAsset(request, env, path) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  return env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
}

async function notFound(request, env) {
  try {
    const resp = await serveAsset(request, env, '/404.html');
    return new Response(resp.body, { status: 404, headers: resp.headers });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

function redirect(path) {
  return Response.redirect(path, 302);
}

async function routePage(db, env, url, request) {
  const path = url.pathname;
  const key = url.searchParams.get('key');
  const adminParam = url.searchParams.get('admin');
  const session = await getSession(db, request, env.COOKIE_SECRET);

  if (adminParam !== null) {
    if (adminParam === env.ADMIN_PARAM) return serveAsset(request, env, '/admin-login.html');
    return notFound(request, env);
  }

  if (key !== null) {
    const invite = await db.get('SELECT code FROM invites WHERE code=?', key);
    const user = await db.get('SELECT id FROM users WHERE invite_code=?', key);
    if (invite || user) return serveAsset(request, env, '/login.html');
    return notFound(request, env);
  }

  if (path === '/dashboard') {
    if (session && !session.is_admin && session.user_id) return serveAsset(request, env, '/dashboard.html');
    return notFound(request, env);
  }
  if (path === '/admin') {
    if (session && session.is_admin) return serveAsset(request, env, '/admin.html');
    return notFound(request, env);
  }

  if (session) {
    if (session.is_admin) return redirect('/admin');
    if (session.user_id) return redirect('/dashboard');
  }
  return notFound(request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = new DB(env.DB);

    try {
      // Bot API
      if (path.startsWith('/api/bot/')) {
        if (request.headers.get('X-Bot-Key') !== env.BOT_API_KEY)
          return json({ error: 'unauthorized' }, 401);
        return await handleBot(db, env, url, request);
      }

      // Auth (public)
      if (path.startsWith('/api/auth/')) {
        return await handleAuth(db, env, url, request);
      }

      const session = await getSession(db, request, env.COOKIE_SECRET);

      if (path.startsWith('/api/login/')) {
        if (!session || session.is_admin || !session.user_id)
          return json({ error: 'forbidden' }, 403);
        return await handleLogin(db, env, url, request, session);
      }

      if (path.startsWith('/api/admin/')) {
        if (!session || !session.is_admin)
          return json({ error: 'forbidden' }, 403);
        return await handleAdmin(db, env, url, request, session);
      }

      if (path.startsWith('/api/user/')) {
        if (!session || session.is_admin || !session.user_id)
          return json({ error: 'forbidden' }, 403);
        return await handleUser(db, env, url, request, session);
      }

      // Static assets
      if (path.startsWith('/css/') || path.startsWith('/js/') || path === '/favicon.ico') {
        return env.ASSETS.fetch(request);
      }

      return await routePage(db, env, url, request);

    } catch (e) {
      console.error('Worker error:', e.message, e.stack);
      return json({ error: 'internal_error', detail: e.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const db = new DB(env.DB);
    try {
      if (await isJobRunning(db)) return;
      await dispatch(env, 'run-selfbot', { triggered_by: 'cf-cron', ts: Date.now() });
    } catch (e) {
      console.error('cron error:', e.message);
    }
  }
};