from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import admin, agents, auth, catalog, chat, conversations, usage, vaults


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(agents.router)
app.include_router(vaults.router)
app.include_router(admin.router)
app.include_router(usage.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.version}
