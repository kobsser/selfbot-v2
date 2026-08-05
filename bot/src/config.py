import os
import sys


class Config:
    def __init__(self):
        self.cf_api_url = os.getenv("CF_API_URL", "").rstrip("/")
        self.bot_api_key = os.getenv("BOT_API_KEY", "")
        self.tg_api_id = int(os.getenv("TG_API_ID", "0"))
        self.tg_api_hash = os.getenv("TG_API_HASH", "")
        self.encryption_key = os.getenv("SESSION_ENCRYPTION_KEY", "")
        # Token bot user ID to listen for
        self.bot_user_id = int(os.getenv("BOT_USER_ID", "8299996037"))
        # How often to save state (seconds)
        self.state_save_interval = int(os.getenv("STATE_SAVE_INTERVAL", "120"))
        # How often to send heartbeat (seconds)
        self.heartbeat_interval = int(os.getenv("HEARTBEAT_INTERVAL", "300"))
        # Graceful shutdown buffer (seconds before hard limit)
        self.shutdown_buffer = int(os.getenv("SHUTDOWN_BUFFER", "300"))

    def validate(self):
        missing = []
        if not self.cf_api_url:
            missing.append("CF_API_URL")
        if not self.bot_api_key:
            missing.append("BOT_API_KEY")
        if not self.tg_api_id:
            missing.append("TG_API_ID")
        if not self.tg_api_hash:
            missing.append("TG_API_HASH")
        if not self.encryption_key:
            missing.append("SESSION_ENCRYPTION_KEY")
        if missing:
            print(f"[FATAL] Missing required env vars: {', '.join(missing)}")
            sys.exit(1)


# Game-specific keywords (Persian) - used by automations
# These are the ACTUAL strings sent/matched on Telegram
GAME_KEYWORDS = {
    "meow_send": "میو",
    "meow_point": "میو پوینت",
    "meow_after": "بعد از",
    "pishi": "پیشی",
    "smuggle": "قاچاق",
}