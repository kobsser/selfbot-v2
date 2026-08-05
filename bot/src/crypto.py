import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class SessionCrypto:
    """Encrypts/decrypts Telegram session strings."""

    def __init__(self, master_key: str):
        # Derive a Fernet key from the master key
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"selfbot-session-salt-v1",
            iterations=100_000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(master_key.encode()))
        self.fernet = Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        return self.fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        # Handle both: base64-encoded plain (from web) or Fernet-encrypted
        try:
            return self.fernet.decrypt(token.encode()).decode()
        except Exception:
            # Might be base64-encoded plain session from the web dashboard
            try:
                return base64.b64decode(token).decode()
            except Exception:
                return token