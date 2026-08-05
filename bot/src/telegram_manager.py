import asyncio
from pyrogram import Client
from pyrogram.errors import (
    ConnectionError,
    RPCError,
    UserDeactivated,
    AuthKeyUnregistered,
)
from utils.logger import get_logger
from utils.retry import async_retry

log = get_logger("telegram")


class TelegramManager:
    """Manages multiple Kurigram clients (one per account)."""

    def __init__(self, api_id: int, api_hash: str, crypto):
        self.api_id = api_id
        self.api_hash = api_hash
        self.crypto = crypto
        self.clients = {}  # account_id -> Client
        self.tasks = {}    # account_id -> list of asyncio tasks

    @async_retry(max_retries=3, delay=2.0, exceptions=(ConnectionError, TimeoutError))
    async def start_client(self, account: dict) -> Client:
        """Start a Kurigram client for an account."""
        account_id = account["id"]
        phone = account["phone"]
        session_string = self.crypto.decrypt(account["session_string_encrypted"])

        client = Client(
            name=f"bot_{account_id}",
            api_id=self.api_id,
            api_hash=self.api_hash,
            session_string=session_string,
            in_memory=True,
            no_updates=True,
            workdir="/tmp",
        )

        try:
            await client.connect()
            if not await client.is_connected():
                await client.start()
            me = await client.get_me()
            log.info(f"[{phone}] Connected as {me.first_name} (id={me.id})")
            self.clients[account_id] = client
            return client
        except (UserDeactivated, AuthKeyUnregistered) as e:
            log.error(f"[{phone}] Session invalid/deactivated: {e}")
            raise
        except Exception as e:
            log.error(f"[{phone}] Failed to connect: {e}")
            raise

    async def stop_client(self, account_id: int):
        """Gracefully stop a client."""
        client = self.clients.pop(account_id, None)
        if client:
            try:
                await client.stop()
                log.info(f"[{account_id}] Client stopped")
            except Exception as e:
                log.warning(f"[{account_id}] Error stopping client: {e}")

    async def stop_all(self):
        """Stop all clients."""
        for account_id in list(self.clients.keys()):
            await self.stop_client(account_id)

    async def monitor_client(self, account: dict, client: Client, on_disconnect):
        """Monitor a client and trigger reconnect if needed."""
        account_id = account["id"]
        phone = account["phone"]

        while True:
            await asyncio.sleep(60)
            try:
                if not client.is_connected:
                    log.warning(f"[{phone}] Client disconnected, triggering reconnect")
                    await on_disconnect(account)
                    break
                # Simple ping to verify connection
                await client.get_me()
            except Exception as e:
                log.warning(f"[{phone}] Health check failed: {e}")
                await on_disconnect(account)
                break