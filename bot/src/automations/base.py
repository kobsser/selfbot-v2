import asyncio
import random
from datetime import datetime, timezone
from utils.logger import get_logger


class BaseAutomation:
    """Base class for all game automations."""

    name = "base"

    def __init__(self, account_id: int, phone: str, groups: list, settings: dict):
        self.account_id = account_id
        self.phone = phone
        self.groups = groups  # list of chat_ids
        self.settings = settings
        self.log = get_logger(f"{self.name}:{phone}")
        self.actions_count = 0
        self._stop_event = asyncio.Event()

    def randomize_delay(self, base_delay: float) -> float:
        """Add random jitter to avoid pattern detection."""
        if not self.settings.get("randomize_delay", True):
            return base_delay
        jitter = random.uniform(-0.15, 0.15) * base_delay
        return max(1.0, base_delay + jitter)

    def now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def stop(self):
        self._stop_event.set()

    @property
    def stopped(self) -> bool:
        return self._stop_event.is_set()

    async def run(self, client):
        """Main loop - override in subclass."""
        raise NotImplementedError

    async def handle_bot_message(self, client, message):
        """Handle incoming message from the token bot - override in subclass."""
        pass