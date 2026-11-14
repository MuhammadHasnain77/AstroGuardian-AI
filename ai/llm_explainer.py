"""Language layer: turns the engine's evaluation into plain-language guidance.

SAFETY CONTRACT
    The LLM never decides or changes the alert tier. It receives the tier,
    findings and actions already computed by the deterministic engine, and
    only explains them. If the LLM is unavailable, a template explanation is
    returned instead, so the app keeps working offline.

DEPLOYMENT MODES (env LLM_PROVIDER)
    groq  - DEMO ONLY. Calls GPT-OSS-20B hosted on Groq over the internet so
            judges can run the project on any laptop.
    local - FLIGHT CONFIGURATION. The same open-weight GPT-OSS-20B model
            served onboard by an OpenAI-compatible server (e.g. Ollama,
            llama.cpp, vLLM). No internet required.
    off   - No LLM; template explanations only.

Both groq and local speak the same OpenAI-compatible Chat Completions API,
so moving from demo to flight is a configuration change, not a code change.
"""

import json
import os
from pathlib import Path

import httpx

_ROOT = Path(__file__).resolve().parent.parent

PROVIDERS = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "openai/gpt-oss-20b",
        "key_env": "GROQ_API_KEY",
    },
    "local": {
        "base_url": "http://localhost:11434/v1",   # Ollama default
        "model": "gpt-oss:20b",
        "key_env": None,
    },
}

SYSTEM_PROMPT = """You are AstroGuardian, the onboard health assistant for astronauts on a long-duration mission.

Rules you must follow:
- The alert tier (GREEN / YELLOW / RED / UNKNOWN) was set by a validated deterministic engine. Never change, downgrade, or question it.
- Only use the numbers in the provided evaluation and protocol notes. Never invent readings, diagnoses, or medications.
- You do not diagnose. For RED, or anything you are unsure about, tell the astronaut to contact the Crew Medical Officer (CMO).
- Be calm, direct and brief: astronauts read this between tasks. Plain language, no markdown tables.
- If a question is unrelated to crew health or the mission, say you can only help with health monitoring."""


def _protocol_notes() -> str:
    path = _ROOT / "research" / "health_indicators.md"
    try:
        return path.read_text(encoding="utf-8")[:4000]
    except OSError:
        return ""


def config() -> dict:
    provider = os.getenv("LLM_PROVIDER", "groq").strip().lower()
    if provider not in PROVIDERS:
        return {"provider": "off", "model": None, "base_url": None, "api_key": None, "enabled": False}
    defaults = PROVIDERS[provider]
    key = os.getenv(defaults["key_env"]) if defaults["key_env"] else None
    cfg = {
        "provider": provider,
        "model": os.getenv("LLM_MODEL") or defaults["model"],
        "base_url": (os.getenv("LLM_BASE_URL") or defaults["base_url"]).rstrip("/"),
        "api_key": key,
    }
    cfg["enabled"] = provider == "local" or bool(key)
    return cfg


def public_config() -> dict:
    cfg = config()
    return {
        "provider": cfg["provider"],
        "model": cfg["model"],
        "enabled": cfg["enabled"],
        "demo_mode": cfg["provider"] == "groq",
    }


def _compact(evaluation: dict, name: str) -> str:
    """The minimal structured context the LLM needs — nothing more."""
    return json.dumps({
        "astronaut": name,
        "risk_level": evaluation["risk_level"],
        "reading_timestamp": evaluation.get("reading_timestamp"),
        "current_reading": evaluation.get("current"),
        "personal_baseline": {k: {"mean": v["mean"], "std": v["std"]}
                              for k, v in evaluation.get("baseline", {}).items() if v.get("reliable")},
        "findings": [{k: f.get(k) for k in ("severity", "kind", "message")} for f in evaluation["findings"]],
        "engine_actions": evaluation.get("actions", []),
    }, default=str)


def _chat(messages: list, cfg: dict, timeout: float = 20.0) -> str:
    headers = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        headers["Authorization"] = f"Bearer {cfg['api_key']}"
    resp = httpx.post(
        f"{cfg['base_url']}/chat/completions",
        headers=headers,
        json={
            "model": cfg["model"],
            "messages": messages,
            "temperature": 0.3,
            # gpt-oss is a reasoning model; reasoning tokens count toward this cap.
            "max_tokens": 1200,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"].get("content") or ""
    if not content.strip():
        raise ValueError("empty completion")
    return content.strip()


def fallback_explanation(evaluation: dict, name: str) -> str:
    lines = [f"{name}: status {evaluation['risk_level']}. {evaluation['summary']}"]
    for f in evaluation["findings"]:
        lines.append(f"- {f['message']}")
    if evaluation.get("actions"):
        lines.append("Next steps: " + " ".join(evaluation["actions"][:3]))
    return "\n".join(lines)


def explain(evaluation: dict, name: str) -> dict:
    """Plain-language explanation of an evaluation. Never raises."""
    cfg = config()
    if cfg["enabled"]:
        try:
            text = _chat([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content":
                    "Explain this health evaluation to the astronaut in under 120 words: what it means, "
                    "why the tier was set, and the most important next step.\n\n"
                    f"EVALUATION:\n{_compact(evaluation, name)}"},
            ], cfg)
            return {"text": text, "source": "llm", "provider": cfg["provider"], "model": cfg["model"]}
        except (httpx.HTTPError, KeyError, ValueError, IndexError) as exc:
            return {"text": fallback_explanation(evaluation, name), "source": "fallback",
                    "provider": cfg["provider"], "model": cfg["model"], "error": type(exc).__name__}
    return {"text": fallback_explanation(evaluation, name), "source": "fallback",
            "provider": cfg["provider"], "model": cfg["model"], "error": "llm_disabled"}


def answer(evaluation: dict, name: str, question: str, history: list | None = None) -> dict:
    """Answer an astronaut's question grounded in their evaluation. Never raises."""
    cfg = config()
    if not cfg["enabled"]:
        return {"text": "The AI assistant is offline. Your status and recommended actions above are still "
                        "valid; contact the CMO with any concerns.",
                "source": "fallback", "provider": cfg["provider"], "model": cfg["model"], "error": "llm_disabled"}
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"PROTOCOL NOTES:\n{_protocol_notes()}"},
        {"role": "system", "content": f"CURRENT EVALUATION:\n{_compact(evaluation, name)}"},
    ]
    for turn in (history or [])[-6:]:
        if turn.get("role") in ("user", "assistant") and isinstance(turn.get("content"), str):
            messages.append({"role": turn["role"], "content": turn["content"][:2000]})
    messages.append({"role": "user", "content": question[:2000]})
    try:
        return {"text": _chat(messages, cfg), "source": "llm", "provider": cfg["provider"], "model": cfg["model"]}
    except (httpx.HTTPError, KeyError, ValueError, IndexError) as exc:
        return {"text": "The AI assistant could not be reached. Your status and actions above are still valid; "
                        "contact the CMO with any concerns.",
                "source": "fallback", "provider": cfg["provider"], "model": cfg["model"],
                "error": type(exc).__name__}
