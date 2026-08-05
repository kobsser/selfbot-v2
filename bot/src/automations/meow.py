import asyncio
import re
from .base import BaseAutomation
from config import GAME_KEYWORDS


class MeowAutomation(BaseAutomation):
    name = "meow"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.interval = self.settings.get("meow_interval", 300)
        self.wait_until = {}

    def extract_wait_time(self, text: str) -> int:
        text = text.replace('۰','0').replace('۱','1').replace('۲','2').replace('۳','3') \
                   .replace('۴','4').replace('۵','5').replace('۶','6').replace('۷','7') \
                   .replace('۸','8').replace('۹','9')
        match = re.search(r'بعد از\s*(\d+)', text)
        if match:
            return int(match.group(1))
        return 0

    async def run(self, client):
        self.log.info(f"Starting meow loop for {len(self.groups)} groups, interval={self.interval}s")

        while not self.stopped:
            for group_id in self.groups:
                if self.stopped:
                    break

                now = asyncio.get_event_loop().time()
                if group_id in self.wait_until and now < self.wait_until[group_id]:
                    remaining = self.wait_until[group_id] - now
                    self.log.info(f"[{group_id}] Waiting {remaining:.0f}s (cooldown)")
                    await self._interruptible_sleep(remaining)
                    continue

                try:
                    await client.send_message(group_id, GAME_KEYWORDS["meow_send"])
                    self.actions_count += 1
                    self.log.info(f"[{group_id}] Sent meow (total: {self.actions_count})")
                except Exception as e:
                    self.log.error(f"[{group_id}] Failed to send meow: {e}")

                await self._interruptible_sleep(self.randomize_delay(2))

            delay = self.randomize_delay(self.interval)
            self.log.info(f"Round complete. Sleeping {delay:.0f}s")
            await self._interruptible_sleep(delay)

    async def handle_bot_message(self, client, message):
        text = message.text or ""
        chat_id = message.chat.id

        if GAME_KEYWORDS["meow_point"] in text and GAME_KEYWORDS["meow_after"] in text:
            wait_time = self.extract_wait_time(text)
            if wait_time > 0:
                loop = asyncio.get_event_loop()
                self.wait_until[chat_id] = loop.time() + wait_time
                self.log.info(f"[{chat_id}] Token bot says wait {wait_time}s")