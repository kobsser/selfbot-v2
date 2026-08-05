import asyncio
from pyrogram import Client
from pyrogram.errors import (
    RPCError,
    UserDeactivated,
    AuthKeyUnregistered,
    FloodWait,
)
from utils.logger import get_logger, mask_phone
from utils.retry import async_retry

log = get_logger("telegram")


class TelegramManager:
    """Manages multiple Kurigram clients (one per account)."""

    def __init__(self, api_id: int, api_hash: str, crypto):
        self.api_id = api_id
        self.api_hash = api_hash
        self.crypto = crypto
        self.clients = {}
        self.tasks = {}

    @async_retry(max_retries=3, delay=2.0, exceptions=(RPCError, TimeoutError, OSError))
    async def start_client(self, account: dict) -> Client:
        account_id = account["id"]
        phone = account["phone"]
        safe_phone = mask_phone(phone)
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
            await client.start()
            me = await client.get_me()
            log.info(f"[{safe_phone}] Connected (id={me.id})")
            self.clients[account_id] = client
            return client
        except (UserDeactivated, AuthKeyUnregistered) as e:
            log.error(f"[{safe_phone}] Session invalid/deactivated: {e}")
            raise
        except FloodWait as e:
            log.warning(f"[{safe_phone}] FloodWait {e.value}s, waiting...")
            await asyncio.sleep(e.value)
            raise
        except Exception as e:
            log.error(f"[{safe_phone}] Failed to connect: {e}")
            raise

    async def stop_client(self, account_id: int):
        client = self.clients.pop(account_id, None)
        if client:
            try:
                await client.stop()
                log.info(f"[account:{account_id}] Client stopped")
            except Exception as e:
                log.warning(f"[account:{account_id}] Error stopping: {e}")

    async def stop_all(self):
        for account_id in list(self.clients.keys()):
            await self.stop_client(account_id)