from .base import BaseAutomation
from config import GAME_KEYWORDS


class FishAutomation(BaseAutomation):
    name = "fish"

    async def run(self, client):
        self.log.info("Fish automation ready (reactive mode)")
        while not self.stopped:
            await self._interruptible_sleep(10)

    async def handle_bot_message(self, client, message):
        text = message.text or message.caption or ""
        chat_id = message.chat.id

        if GAME_KEYWORDS["pishi"] not in text:
            return

        if not message.reply_markup or not hasattr(message.reply_markup, 'inline_keyboard'):
            self.log.warning(f"[{chat_id}] Pishi message but no inline buttons")
            return

        try:
            keyboard = message.reply_markup.inline_keyboard
            if keyboard and keyboard[0]:
                button = keyboard[0][0]
                await button.click()
                self.actions_count += 1
                self.log.info(f"[{chat_id}] Clicked first button (pishi)")
        except Exception as e:
            self.log.error(f"[{chat_id}] Failed to click button: {e}")