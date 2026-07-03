import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from passlib.context import CryptContext

from .config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

VIRTUAL_KEY_PREFIX = "sk-lm-"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(user_id: str, role: str) -> str:
    s = get_settings()
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=s.jwt_expire_minutes),
    }
    return jwt.encode(payload, s.secret_key, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    s = get_settings()
    try:
        return jwt.decode(token, s.secret_key, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def _fernet() -> Fernet:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError(
            "LLMM_ENCRYPTION_KEY no está configurada; es obligatoria para guardar credenciales"
        )
    return Fernet(key.encode())


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def generate_virtual_key() -> str:
    return VIRTUAL_KEY_PREFIX + secrets.token_urlsafe(32)


def hash_virtual_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()
