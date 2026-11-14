"""Demo role switcher: no password, the visitor just picks a role.

    POST /api/auth/role {role, astronaut_id?} -> cookie {role, astronaut_id}

This is NOT authentication: anyone can pick any role. It exists so each role
gets its own view and its own permissions, which are enforced on the server.
A flight system would use individual crew credentials.

Sessions are stateless HMAC-signed cookies, so they work on serverless hosts.
Set SECRET_KEY in production so cookies survive restarts and can't be forged.
"""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Depends, HTTPException, Request, Response

COOKIE = "ag_session"
MAX_AGE = 12 * 3600

ROLES = {
    "astronaut": {
        "label": "Astronaut",
        "description": "See and log your own health data. Ask the AI assistant about your status.",
        "permissions": {"use_assistant", "submit_own_reading"},
    },
    "cmo": {
        "label": "Crew Medical Officer",
        "description": "Monitor the whole crew, log readings for anyone, acknowledge alerts.",
        "permissions": {"view_all_crew", "use_assistant", "submit_own_reading", "submit_any_reading",
                        "acknowledge_alert"},
    },
    "ground": {
        "label": "Ground Flight Surgeon",
        "description": "Review crew data from Earth, add medical advice to alerts, run ground sync. Read-only vitals.",
        "permissions": {"view_all_crew", "use_assistant", "ground_note", "sync"},
    },
}

def _secret() -> bytes:
    # A fixed fallback keeps sessions valid across serverless cold starts. It
    # grants nothing extra (anyone can already pick any role), but a forged
    # cookie could skip the role picker, so set SECRET_KEY in production.
    key = os.getenv("SECRET_KEY") or "astroguardian-demo-session"
    return hashlib.sha256(key.encode()).digest()


def sign(payload: dict) -> str:
    payload = {**payload, "exp": int(time.time()) + MAX_AGE}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    expected = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except ValueError:
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


def set_cookie(response: Response, request: Request, payload: dict):
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(COOKIE, sign(payload), max_age=MAX_AGE, httponly=True, samesite="lax",
                        secure=secure, path="/")


def clear_cookie(response: Response):
    response.delete_cookie(COOKIE, path="/")


# -------------------------------------------------------------- dependencies ---

class User:
    def __init__(self, role: str, astronaut_id: str | None):
        self.role = role
        self.astronaut_id = astronaut_id
        self.permissions = ROLES[role]["permissions"]

    @property
    def label(self) -> str:
        return ROLES[self.role]["label"] + (f" ({self.astronaut_id})" if self.astronaut_id else "")

    def can(self, perm: str) -> bool:
        return perm in self.permissions

    def can_view(self, aid: str) -> bool:
        return self.can("view_all_crew") or aid == self.astronaut_id

    def visible_ids(self, all_ids: list) -> list:
        return list(all_ids) if self.can("view_all_crew") else [i for i in all_ids if i == self.astronaut_id]

    def as_dict(self) -> dict:
        return {"role": self.role, "role_label": ROLES[self.role]["label"], "astronaut_id": self.astronaut_id,
                "permissions": sorted(self.permissions)}


def session(request: Request) -> dict:
    return verify(request.cookies.get(COOKIE)) or {}


def current_user(request: Request) -> User:
    s = session(request)
    role = s.get("role")
    if role not in ROLES:
        raise HTTPException(401, "Choose a role first.")
    return User(role, s.get("astronaut_id"))


def require(perm: str):
    def dep(user: User = Depends(current_user)) -> User:
        if not user.can(perm):
            raise HTTPException(403, f"Your role ({ROLES[user.role]['label']}) can't do this.")
        return user
    return dep


def require_view(aid: str, user: User):
    if not user.can_view(aid):
        raise HTTPException(403, "You can only access your own health data.")
