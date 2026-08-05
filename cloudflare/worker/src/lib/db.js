// Thin D1 helpers

export class DB {
  constructor(d1) {
    this.d1 = d1;
  }

  async get(sql, ...params) {
    return this.d1.prepare(sql).bind(...params).first();
  }

  async all(sql, ...params) {
    const { results } = await this.d1.prepare(sql).bind(...params).all();
    return results;
  }

  async run(sql, ...params) {
    return this.d1.prepare(sql).bind(...params).run();
  }

  async getSetting(key, fallback = null) {
    const row = await this.get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : fallback;
  }

  async setSetting(key, value) {
    await this.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, String(value)
    );
  }
}