"""
Message handler registration for Kurigram clients.
Routes token bot messages to the appropriate automation.
"""
from pyrogram import filters
from pyrogram.types import Message
from utils.logger import get_logger

log = get_logger("handlers")


def register_handlers(client, account, automations, bot_user_id):
    """Register message handlers for a single account's client."""
    chat_ids = set(account["selected_groups"])
    my_user_id = None  # Will be set after client starts

    @client.on_message(filters.group & filters.user(bot_user_id))
    async def on_token_bot_message(c: Client, message: Message):
        nonlocal my_user_id

        # Only process in selected groups
        if message.chat.id not in chat_ids:
            return

        # Get our user ID if not cached
        if my_user_id is None:
            try:
                me = await c.get_me()
                my_user_id = me.id
            except Exception as e:
                log.error(f"Failed to get self: {e}")
                return

        # Only process if the bot is replying to OUR message
        if not message.reply_to_message:
            return
        if message.reply_to_message.from_user.id != my_user_id:
            return

        # Route to automations
        for automation in automations:
            try:
                await automation.handle_bot_message(c, message)
            except Exception as e:
                log.error(f"Automation {automation.name} handler error: {e}")

    return on_token_bot_message