import { json } from '../index.js';

export async function handleUser(db, env, url, request, session) {
  const path = url.pathname;
  const userId = session.user_id;

  // GET /api/user/accounts
  if (path === '/api/user/accounts' && request.method === 'GET') {
    const accounts = await db.all(
      `SELECT a.id, a.phone, a.display_name, a.is_active,
              s.meow_enabled, s.fish_enabled, s.smuggle_enabled,
              s.selected_groups, s.meow_interval
       FROM accounts a
       LEFT JOIN account_settings s ON s.account_id = a.id
       WHERE a.user_id = ?`,
      userId
    );
    const maxAccounts = await getMaxAccounts(db, userId);
    return json({ accounts, maxAccounts });
  }

  // POST /api/user/accounts (add account: phone + encrypted session)
  if (path === '/api/user/accounts' && request.method === 'POST') {
    const body = await request.json();
    const { phone, displayName, sessionStringEncrypted } = body;
    if (!phone || !sessionStringEncrypted) return json({ error: 'missing' }, 400);

    const maxAccounts = await getMaxAccounts(db, userId);
    const count = await db.get('SELECT COUNT(*) as c FROM accounts WHERE user_id = ?', userId);
    if (count.c >= maxAccounts) return json({ error: 'limit_reached' }, 403);

    const res = await db.run(
      'INSERT INTO accounts (user_id, phone, display_name, session_string_encrypted) VALUES (?, ?, ?, ?)',
      userId, phone, displayName || phone, sessionStringEncrypted
    );
    const accountId = res.meta.last_row_id;
    await db.run(
      'INSERT INTO account_settings (account_id) VALUES (?)', accountId
    );
    return json({ ok: true, accountId });
  }

  // PUT /api/user/accounts/:id/settings
  const settingsMatch = path.match(/^\/api\/user\/accounts\/(\d+)\/settings$/);
  if (settingsMatch && request.method === 'PUT') {
    const accountId = parseInt(settingsMatch[1]);
    const owns = await db.get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', accountId, userId);
    if (!owns) return json({ error: 'forbidden' }, 403);

    const body = await request.json();
    await db.run(
      `INSERT INTO account_settings (account_id, meow_enabled, fish_enabled, smuggle_enabled, selected_groups, meow_interval)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         meow_enabled = excluded.meow_enabled,
         fish_enabled = excluded.fish_enabled,
         smuggle_enabled = excluded.smuggle_enabled,
         selected_groups = excluded.selected_groups,
         meow_interval = excluded.meow_interval`,
      accountId,
      body.meow_enabled ? 1 : 0,
      body.fish_enabled ? 1 : 0,
      body.smuggle_enabled ? 1 : 0,
      JSON.stringify(body.selected_groups || []),
      body.meow_interval || 300
    );
    return json({ ok: true });
  }

  // DELETE /api/user/accounts/:id
  const delMatch = path.match(/^\/api\/user\/accounts\/(\d+)$/);
  if (delMatch && request.method === 'DELETE') {
    const accountId = parseInt(delMatch[1]);
    const owns = await db.get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', accountId, userId);
    if (!owns) return json({ error: 'forbidden' }, 403);
    await db.run('DELETE FROM bot_state WHERE account_id = ?', accountId);
    await db.run('DELETE FROM account_settings WHERE account_id = ?', accountId);
    await db.run('DELETE FROM accounts WHERE id = ?', accountId);
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

async function getMaxAccounts(db, userId) {
  const user = await db.get('SELECT max_accounts FROM users WHERE id = ?', userId);
  if (user && user.max_accounts !== null) return user.max_accounts;
  const global = await db.getSetting('max_accounts_global', '4');
  return parseInt(global);
}