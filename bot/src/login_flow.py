import asyncio, os, time
import httpx
from pyrogram import Client
from pyrogram.errors import (
    PhoneNumberInvalid, PhoneCodeInvalid, PhoneCodeExpired,
    SessionPasswordNeeded, FloodWait
)
from crypto import SessionCrypto

CF_API_URL = os.getenv("CF_API_URL", "").rstrip("/")
BOT_API_KEY = os.getenv("BOT_API_KEY", "")
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
ENC_KEY = os.getenv("SESSION_ENCRYPTION_KEY", "")
LOGIN_ID = os.getenv("LOGIN_ID", "")
PHONE = os.getenv("PHONE", "")

POLL_INTERVAL = 3
CODE_TIMEOUT = 240       # 4 min to enter code
PASSWORD_TIMEOUT = 240   # 4 min to enter 2FA password

HEADERS = {"X-Bot-Key": BOT_API_KEY, "Content-Type": "application/json"}


async def call(http, method, path, **kw):
    r = await http.request(method, CF_API_URL + path, headers=HEADERS, timeout=30, **kw)
    r.raise_for_status()
    return r.json()


async def set_status(http, status, **extra):
    await call(http, "POST", "/api/bot/login/update",
               json={"login_id": LOGIN_ID, "status": status, **extra})


async def poll_field(http, field, timeout):
    start = time.time()
    while time.time() - start < timeout:
        data = await call(http, "GET", f"/api/bot/login/poll?login_id={LOGIN_ID}")
        if data.get("status") in ("cancelled", "expired"):
            return None
        if data.get(field):
            return data[field]
        await asyncio.sleep(POLL_INTERVAL)
    return None


async def main():
    crypto = SessionCrypto(ENC_KEY)
    async with httpx.AsyncClient() as http:
        client = Client(f"login_{LOGIN_ID}", api_id=API_ID, api_hash=API_HASH, in_memory=True)
        try:
            await client.connect()

            # 1) Send code
            try:
                sent = await client.send_code(PHONE)
            except PhoneNumberInvalid:
                return await set_status(http, "failed", error="Invalid phone number")
            except FloodWait as e:
                return await set_status(http, "failed", error=f"Telegram rate limit, wait {e.value}s")
            except Exception as e:
                return await set_status(http, "failed", error=f"send_code: {e}")

            await set_status(http, "waiting_code", phone_code_hash=sent.phone_code_hash)

            # 2) Wait for user's code
            code = await poll_field(http, "submitted_code", CODE_TIMEOUT)
            if not code:
                return await set_status(http, "failed", error="Code not entered in time")

            # 3) Sign in (handle 2FA)
            try:
                await client.sign_in(PHONE, sent.phone_code_hash, code)
            except SessionPasswordNeeded:
                await set_status(http, "waiting_password")
                password = await poll_field(http, "submitted_password", PASSWORD_TIMEOUT)
                if not password:
                    return await set_status(http, "failed", error="Password not entered in time")
                try:
                    await client.check_password(password)
                except Exception as e:
                    return await set_status(http, "failed", error="Incorrect password")
            except PhoneCodeInvalid:
                return await set_status(http, "failed", error="Invalid code")
            except PhoneCodeExpired:
                return await set_status(http, "failed", error="Code expired")
            except Exception as e:
                return await set_status(http, "failed", error=f"sign_in: {e}")

            # 4) Success -> encrypt session + save account
            me = await client.get_me()
            session_string = await client.export_session_string()
            encrypted = crypto.encrypt(session_string)
            display_name = getattr(me, "first_name", None) or PHONE

            await call(http, "POST", "/api/bot/login/complete", json={
                "login_id": LOGIN_ID,
                "encrypted_session": encrypted,
                "phone": PHONE,
                "display_name": display_name,
            })
            print(f"[OK] Logged in {PHONE}")

        finally:
            try:
                await client.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    asyncio.run(main())
