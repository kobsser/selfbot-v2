import asyncio
import httpx
from utils.logger import get_logger

log = get_logger("api")


class CFApiClient:
    """HTTP client for the Cloudflare Workers API."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.headers = {
            "X-Bot-Key": api_key,
            "Content-Type": "application/json",
        }
        self._client = None

    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=30.0
        )
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs):
        for attempt in range(3):
            try:
                resp = await self._client.request(method, path, **kwargs)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                log.warning(f"API request failed ({attempt+1}/3): {method} {path}: {e}")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise

    async def get_config(self):
        return await self._request("GET", "/api/bot/config")

    async def load_state(self, account_id: int):
        return await self._request("GET", f"/api/bot/state?account_id={account_id}")

    async def save_state(self, states: list):
        return await self._request("POST", "/api/bot/state", json={"states": states})

    async def start_job(self, run_id: str = None):
        return await self._request("POST", "/api/bot/jobs/start", json={"run_id": run_id})

    async def heartbeat(self, job_id: int):
        return await self._request("POST", "/api/bot/jobs/heartbeat", json={"jobId": job_id})

    async def complete_job(self, job_id: int, status: str, accounts: int, actions: int):
        return await self._request("POST", "/api/bot/jobs/complete", json={
            "jobId": job_id,
            "status": status,
            "accountsProcessed": accounts,
            "actionsExecuted": actions,
        })

    async def log_actions(self, actions: list):
        try:
            return await self._request("POST", "/api/bot/actions/log", json={"actions": actions})
        except Exception as e:
            log.warning(f"Failed to log actions: {e}")