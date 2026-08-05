export async function dispatch(env, eventType, payload = {}) {
  const repo = env.GH_REPO, token = env.GH_TOKEN;
  if (!repo || !token) return { ok: false, error: 'GH_REPO/GH_TOKEN not set' };
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'selfbot-worker'
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload })
  });
  return { ok: res.status === 204, status: res.status };
}
export async function isJobRunning(db) {
  return !!(await db.get(`SELECT id FROM job_runs WHERE status='running' LIMIT 1`));
}
