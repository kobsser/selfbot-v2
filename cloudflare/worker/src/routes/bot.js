import { json } from '../index.js';

// Authenticated via BOT_API_KEY header (used by GitHub Actions bot)
export async function handleBot(db, env, url, request) {
  const path = url.pathname;

  // GET /api/bot/config -> full config for all active accounts
  if (path === '/api/bot/config' && request.method === 'GET') {
    const settings = {};
    const rows = await db.all('SELECT key, value FROM settings');
    rows.forEach(r => settings[r.key] = r.value);

    const accounts = await db.all(`
      SELECT a.id, a.phone, a.session_string_encrypted, a.user_id,
             s.meow_enabled, s.fish_enabled, s.smuggle_enabled,
             s.selected_groups, s.meow_interval, s.randomize_delay
      FROM accounts a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN account_settings s ON s.account_id = a.id
      WHERE a.is_active = 1 AND u.is_active = 1
    `);

    return json({
      settings,
      accounts: accounts.map(a => ({
        ...a,
        selected_groups: JSON.parse(a.selected_groups || '[]')
      }))
    });
  }

  // GET /api/bot/state?account_id=X
  if (path === '/api/bot/state' && request.method === 'GET') {
    const accountId = url.searchParams.get('account_id');
    const states = await db.all('SELECT * FROM bot_state WHERE account_id = ?', accountId);
    return json({ states });
  }

  // POST /api/bot/state -> bulk upsert state
  if (path === '/api/bot/state' && request.method === 'POST') {
    const { states } = await request.json();
    for (const s of states) {
      await db.run(
        `INSERT INTO bot_state (account_id, group_id, last_meow_time, last_fish_time, pending_timer_expiry, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(account_id, group_id) DO UPDATE SET
           last_meow_time = excluded.last_meow_time,
           last_fish_time = excluded.last_fish_time,
           pending_timer_expiry = excluded.pending_timer_expiry,
           updated_at = datetime('now')`,
        s.account_id, s.group_id, s.last_meow_time, s.last_fish_time, s.pending_timer_expiry
      );
    }
    return json({ ok: true });
  }

  // POST /api/bot/jobs/start
  if (path === '/api/bot/jobs/start' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const res = await db.run(
      'INSERT INTO job_runs (run_id, status) VALUES (?, "running")',
      body.run_id || null
    );
    return json({ jobId: res.meta.last_row_id });
  }

  // POST /api/bot/jobs/heartbeat
  if (path === '/api/bot/jobs/heartbeat' && request.method === 'POST') {
    const { jobId } = await request.json();
    await db.run('UPDATE job_runs SET started_at = started_at WHERE id = ?', jobId);
    return json({ ok: true });
  }

  // POST /api/bot/jobs/complete
  if (path === '/api/bot/jobs/complete' && request.method === 'POST') {
    const { jobId, status, accountsProcessed, actionsExecuted } = await request.json();
    await db.run(
      `UPDATE job_runs SET ended_at = datetime('now'), status = ?, accounts_processed = ?, actions_executed = ? WHERE id = ?`,
      status || 'completed', accountsProcessed || 0, actionsExecuted || 0, jobId
    );
    return json({ ok: true });
  }

  // POST /api/bot/actions/log
  if (path === '/api/bot/actions/log' && request.method === 'POST') {
    const { actions } = await request.json();
    for (const a of actions) {
      await db.run(
        'INSERT INTO action_log (account_id, action_type, group_id, detail, success) VALUES (?, ?, ?, ?, ?)',
        a.account_id, a.action_type, a.group_id, a.detail, a.success ? 1 : 0
      );
    }
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}