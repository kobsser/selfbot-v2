export class DB {
  constructor(d1) { this.d1 = d1; }
  get(sql, ...p) { return this.d1.prepare(sql).bind(...p).first(); }
  async all(sql, ...p) { return (await this.d1.prepare(sql).bind(...p).all()).results; }
  run(sql, ...p) { return this.d1.prepare(sql).bind(...p).run(); }
  async getSetting(key, fallback = null) {
    const row = await this.get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : fallback;
  }
  async setSetting(key, value) {
    await this.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key, String(value));
  }
  async getMaxAccountsForUser(userId) {
    const user = await this.get('SELECT max_accounts FROM users WHERE id = ?', userId);
    if (user && user.max_accounts !== null) return user.max_accounts;
    return parseInt(await this.getSetting('max_accounts_global', '4'));
  }
}
