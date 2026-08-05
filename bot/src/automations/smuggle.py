from .base import BaseAutomation
from config import GAME_KEYWORDS


class SmuggleAutomation(BaseAutomation):
    name = "smuggle"

    async def run(self, client):
        self.log.info("Smuggle automation ready")
        while not self.stopped:
            await self._interruptible_sleep(10)

    async def handle_bot_message(self, client, message):
        text = message.text or ""
        chat_id = message.chat.id

        if GAME_KEYWORDS["smuggle"] not in text:
            return

        self.log.info(f"[{chat_id}] Smuggle message detected (logic pending)")