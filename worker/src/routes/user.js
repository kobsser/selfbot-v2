import { json } from '../lib/response.js';

export async function handleUser(db, env, url, request, session) {
  const path = url.pathname;
  const userId = session.user_id;

  if (path === '/api/user/accounts' && request.method === 'GET') {
    const accounts = await db.all(
      `SELECT a.id, a.phone, a.display_name, a.is_active,
              s.meow_enabled, s.fish_enabled, s.smuggle_enabled,
              s.selected_groups, s.meow_interval
       FROM accounts a LEFT JOIN account_settings s ON s.account_id = a.id
       WHERE a.user_id = ?`, userId);
    accounts.forEach(a => a.selected_groups = JSON.parse(a.selected_groups || '[]'));
    const maxAccounts = await db.getMaxAccountsForUser(userId);
    return json({ accounts, maxAccounts });
  }

  const setMatch = path.match(/^\/api\/user\/accounts\/(\d+)\/settings$/);
  if (setMatch && request.method === 'PUT') {
    const accountId = parseInt(setMatch[1]);
    if (!(await db.get('SELECT id FROM accounts WHERE id=? AND user_id=?', accountId, userId)))
      return json({ error: 'forbidden' }, 403);
    const body = await request.json();
    await db.run(
      `INSERT INTO account_settings (account_id,meow_enabled,fish_enabled,smuggle_enabled,selected_groups,meow_interval)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET
         meow_enabled=excluded.meow_enabled, fish_enabled=excluded.fish_enabled,
         smuggle_enabled=excluded.smuggle_enabled, selected_groups=excluded.selected_groups,
         meow_interval=excluded.meow_interval`,
      accountId, body.meow_enabled?1:0, body.fish_enabled?1:0, body.smuggle_enabled?1:0,
      JSON.stringify(body.selected_groups || []), body.meow_interval || 300);
    return json({ ok: true });
  }

  const delMatch = path.match(/^\/api\/user\/accounts\/(\d+)$/);
  if (delMatch && request.method === 'DELETE') {
    const accountId = parseInt(delMatch[1]);
    if (!(await db.get('SELECT id FROM accounts WHERE id=? AND user_id=?', accountId, userId)))
      return json({ error: 'forbidden' }, 403);
    await db.run('DELETE FROM bot_state WHERE account_id=?', accountId);
    await db.run('DELETE FROM account_settings WHERE account_id=?', accountId);
    await db.run('DELETE FROM accounts WHERE id=?', accountId);
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}
