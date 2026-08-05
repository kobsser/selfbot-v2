// Trigger GitHub Actions via repository_dispatch

export async function dispatchWorkflow(env, eventType = 'run-selfbot') {
  const repo = env.GH_REPO;          // e.g. "user/repo"
  const token = env.GH_TOKEN;         // PAT with repo scope
  if (!repo || !token) return { ok: false, error: 'GH_REPO/GH_TOKEN not set' };

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'selfbot-cf-cron'
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: { triggered_by: 'cf-cron', ts: Date.now() }
    })
  });
  return { ok: res.status === 204, status: res.status };
}

export async function isJobRunning(db) {
  const row = await db.get(
    `SELECT id FROM job_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`
  );
  return !!row;
}