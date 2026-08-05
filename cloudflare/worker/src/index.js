import { DB } from './lib/db.js';
import { getSession } from './lib/auth.js';
import { isJobRunning } from './lib/github.js';
import { dispatchWorkflow } from './lib/github.js';
import { handleAuth } from './routes/auth.js';
import { handleUser } from './routes/user.js';
import { handleAdmin } from './routes/admin.js';
import { handleBot } from './routes/bot.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bot-Key',
      'Access-Control-Allow-Credentials': 'true',
      ...headers
    }
  });
}

function notFoundPage() {
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = new DB(env.DB);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Bot-Key',
          'Access-Control-Allow-Credentials': 'true'
        }
      });
    }

    const path = url.pathname;

    // ---- Bot API (X-Bot-Key auth) ----
    if (path.startsWith('/api/bot/')) {
      const key = request.headers.get('X-Bot-Key');
      if (key !== env.BOT_API_KEY) return json({ error: 'unauthorized' }, 401);
      return handleBot(db, env, url, request);
    }

    // ---- Auth endpoints (no session required) ----
    if (path.startsWith('/api/auth/')) {
      return handleAuth(db, env, url, request);
    }

    // ---- Everything else requires session ----
    const session = await getSession(db, request, env.COOKIE_SECRET);

    // Admin endpoints
    if (path.startsWith('/api/admin/')) {
      if (!session || !session.is_admin) return json({ error: 'forbidden' }, 403);
      return handleAdmin(db, env, url, request, session);
    }

    // User endpoints
    if (path.startsWith('/api/user/')) {
      if (!session || session.is_admin || !session.user_id) return json({ error: 'forbidden' }, 403);
      return handleUser(db, env, url, request, session);
    }

    // ---- Page routing (return 404 unless valid param) ----
    const key = url.searchParams.get('key');
    const adminParam = url.searchParams.get('admin');

    // Admin gate
    if (adminParam) {
      if (adminParam === env.ADMIN_PARAM) {
        return redirect(env.PAGES_URL + '/admin-login.html');
      }
      return notFoundPage();
    }

    // Invite/user gate
    if (key) {
      const invite = await db.get('SELECT * FROM invites WHERE code = ?', key);
      const user = await db.get('SELECT id FROM users WHERE invite_code = ?', key);
      if (invite || user) {
        return redirect(env.PAGES_URL + '/login.html?key=' + encodeURIComponent(key));
      }
      return notFoundPage();
    }

    // If logged in, redirect to dashboard
    if (session) {
      if (session.is_admin) return redirect(env.PAGES_URL + '/admin.html');
      return redirect(env.PAGES_URL + '/dashboard.html');
    }

    return notFoundPage();
  },

  // ---- Cron: trigger GH Actions if no job running ----
  async scheduled(event, env, ctx) {
    const db = new DB(env.DB);
    try {
      const running = await isJobRunning(db);
      if (running) {
        console.log('Job already running, skipping dispatch');
        return;
      }
      const result = await dispatchWorkflow(env);
      console.log('Dispatch result:', JSON.stringify(result));
    } catch (e) {
      console.error('Cron error:', e.message);
    }
  }
};

function redirect(url) {
  return Response.redirect(url, 302);
}