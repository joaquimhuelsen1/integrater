from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os
import base64
from ..config import get_settings


def get_key() -> bytes:
    settings = get_settings()
    return base64.b64decode(settings.encryption_key)


def encrypt(plaintext: str) -> str:
    key = get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(encrypted: str) -> str:
    key = get_key()
    data = base64.b64decode(encrypted)
    nonce, ciphertext = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
