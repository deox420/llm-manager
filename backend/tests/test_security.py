import os

os.environ.setdefault("LLMM_ENCRYPTION_KEY", "")

from cryptography.fernet import Fernet  # noqa: E402

from app import security  # noqa: E402


def test_password_hash_roundtrip():
    hashed = security.hash_password("secreto-muy-largo")
    assert hashed != "secreto-muy-largo"
    assert security.verify_password("secreto-muy-largo", hashed)
    assert not security.verify_password("otra-cosa", hashed)


def test_virtual_key_format_and_hash():
    key = security.generate_virtual_key()
    assert key.startswith(security.VIRTUAL_KEY_PREFIX)
    assert security.hash_virtual_key(key) == security.hash_virtual_key(key)
    assert security.hash_virtual_key(key) != security.hash_virtual_key(key + "x")


def test_jwt_roundtrip():
    token = security.create_access_token("user-1", "admin")
    payload = security.decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user-1"
    assert payload["role"] == "admin"
    assert security.decode_access_token("token-invalido") is None


def test_encrypt_decrypt_roundtrip(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(security.get_settings(), "encryption_key", key)
    encrypted = security.encrypt_secret("sk-real-api-key")
    assert encrypted != "sk-real-api-key"
    assert security.decrypt_secret(encrypted) == "sk-real-api-key"
