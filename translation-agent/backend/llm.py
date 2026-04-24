"""Common LLM provider helpers for Anthropic, OpenAI, and Gemini."""

from __future__ import annotations

import asyncio
import json
import os
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal

import certifi
from fastapi import HTTPException

try:
    import anthropic
except Exception:  # pragma: no cover - optional in stripped environments
    anthropic = None

ProviderName = Literal["anthropic", "openai", "gemini"]
LLM_TASKS = {
    "translate",
    "explain",
    "tone",
    "verify",
    "syntax_align",
    "sentence_align",
    "upload",
    "test",
}
SUPPORTED_PROVIDERS: tuple[ProviderName, ...] = ("anthropic", "openai", "gemini")
PROVIDER_LABELS: dict[ProviderName, str] = {
    "anthropic": "Claude",
    "openai": "GPT",
    "gemini": "Gemini",
}
PROVIDER_API_KEY_ENV: dict[ProviderName, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
}
LEGACY_MODEL_ENV_BY_TASK: dict[str, str] = {
    "translate": "ANTHROPIC_TRANSLATE_MODEL",
    "explain": "ANTHROPIC_EXPLAIN_MODEL",
    "tone": "ANTHROPIC_TONE_MODEL",
    "verify": "ANTHROPIC_VERIFY_MODEL",
    "syntax_align": "ANTHROPIC_SYNTAX_ALIGN_MODEL",
    "sentence_align": "ANTHROPIC_SENTENCE_ALIGN_MODEL",
    "test": "ANTHROPIC_TEST_MODEL",
}
DEFAULT_MODELS: dict[ProviderName, dict[str, str]] = {
    "anthropic": {
        "translate": "claude-opus-4-5",
        "explain": "claude-sonnet-4-5",
        "tone": "claude-sonnet-4-5",
        "verify": "claude-sonnet-4-5",
        "syntax_align": "claude-sonnet-4-5",
        "sentence_align": "claude-sonnet-4-5",
        "upload": "claude-haiku-4-5",
        "test": "claude-haiku-4-5",
    },
    "openai": {
        "translate": "gpt-5",
        "explain": "gpt-5-mini",
        "tone": "gpt-5-mini",
        "verify": "gpt-5-mini",
        "syntax_align": "gpt-5-mini",
        "sentence_align": "gpt-5-mini",
        "upload": "gpt-5-mini",
        "test": "gpt-5-mini",
    },
    "gemini": {
        "translate": "gemini-2.5-pro",
        "explain": "gemini-2.5-flash",
        "tone": "gemini-2.5-flash",
        "verify": "gemini-2.5-flash",
        "syntax_align": "gemini-2.5-flash",
        "sentence_align": "gemini-2.5-flash",
        "upload": "gemini-2.5-flash",
        "test": "gemini-2.5-flash",
    },
}


@dataclass(frozen=True)
class LlmTextResponse:
    provider: ProviderName
    model: str
    text: str


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


def normalize_provider(raw: str | None, fallback: str = "anthropic") -> ProviderName:
    candidate = (raw or fallback or "anthropic").strip().lower()
    if candidate in SUPPORTED_PROVIDERS:
        return candidate  # type: ignore[return-value]
    return "anthropic"


def default_provider() -> ProviderName:
    configured_env_provider = (os.getenv("LLM_PROVIDER", "") or "").strip()
    if configured_env_provider:
        return normalize_provider(configured_env_provider, "anthropic")
    for provider in SUPPORTED_PROVIDERS:
        if provider_is_configured(provider):
            return provider
    return "anthropic"


def provider_api_key(provider: ProviderName) -> str:
    return (os.getenv(PROVIDER_API_KEY_ENV[provider], "") or "").strip()


def provider_is_configured(provider: ProviderName) -> bool:
    return bool(provider_api_key(provider))


def configured_providers() -> list[ProviderName]:
    return [provider for provider in SUPPORTED_PROVIDERS if provider_is_configured(provider)]


def any_provider_configured() -> bool:
    return any(provider_is_configured(provider) for provider in SUPPORTED_PROVIDERS)


def task_model(provider: ProviderName, task: str, requested_model: str | None = None) -> str:
    if task not in LLM_TASKS:
        raise ValueError(f"Unsupported LLM task: {task}")

    if requested_model and requested_model.strip():
        return requested_model.strip()

    explicit_env_key = f"{provider.upper()}_{task.upper()}_MODEL"
    explicit_value = (os.getenv(explicit_env_key, "") or "").strip()
    if explicit_value:
        return explicit_value

    if provider == "anthropic":
        legacy_env_key = LEGACY_MODEL_ENV_BY_TASK.get(task)
        legacy_value = (os.getenv(legacy_env_key, "") or "").strip() if legacy_env_key else ""
        if legacy_value:
            return legacy_value

    return DEFAULT_MODELS[provider][task]


def provider_health() -> dict[str, dict[str, Any]]:
    default_name = default_provider()
    return {
        provider: {
            "label": PROVIDER_LABELS[provider],
            "configured": provider_is_configured(provider),
            "default_model": task_model(provider, "translate"),
            "is_default": provider == default_name,
        }
        for provider in SUPPORTED_PROVIDERS
    }


def _provider_timeout_seconds(provider: ProviderName) -> int:
    fallback = int(os.getenv("LLM_REQUEST_TIMEOUT_SECONDS", "180"))
    env_name = {
        "anthropic": "ANTHROPIC_TIMEOUT_SECONDS",
        "openai": "OPENAI_TIMEOUT_SECONDS",
        "gemini": "GEMINI_TIMEOUT_SECONDS",
    }[provider]
    return int(os.getenv(env_name, str(fallback)))


def _load_json_bytes(payload: bytes) -> Any:
    if not payload:
        return {}
    return json.loads(payload.decode("utf-8"))


def _post_json(
    *,
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
    timeout_seconds: int,
) -> Any:
    req = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_seconds, context=_ssl_context()) as response:
        return _load_json_bytes(response.read())


def _http_error_message(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if body.get("message"):
            return str(body["message"])

    if isinstance(exc, urllib.error.HTTPError):
        try:
            payload = _load_json_bytes(exc.read())
        except Exception:
            payload = None
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict) and error.get("message"):
                return str(error["message"])
            if isinstance(error, str) and error:
                return error
            if isinstance(payload.get("message"), str) and payload["message"]:
                return str(payload["message"])

    message = getattr(exc, "message", None)
    return str(message or exc)


def _raise_provider_api_error(exc: Exception, provider: ProviderName, action: str) -> None:
    if isinstance(exc, HTTPException):
        raise exc

    if isinstance(exc, urllib.error.URLError):
        raise HTTPException(
            status_code=502,
            detail=f"{PROVIDER_LABELS[provider]} API connection failed: {exc.reason}",
        ) from exc

    try:
        status_code = int(getattr(exc, "status_code", 0) or getattr(exc, "status", 0) or getattr(exc, "code", 0) or 0)
    except (TypeError, ValueError):
        status_code = 0

    message = _http_error_message(exc)
    lower_message = message.lower()
    provider_label = PROVIDER_LABELS[provider]

    if "usage limit" in lower_message or "usage limits" in lower_message:
        raise HTTPException(
            status_code=429,
            detail=f"{provider_label} API usage limit reached. {message}",
        ) from exc
    if status_code == 429 or "rate limit" in lower_message or "quota" in lower_message:
        raise HTTPException(
            status_code=429,
            detail=f"{provider_label} API rate limit reached. {message}",
        ) from exc
    if status_code in {400, 401, 403}:
        raise HTTPException(
            status_code=status_code,
            detail=f"{action} API call failed: {message}",
        ) from exc
    raise HTTPException(status_code=502, detail=f"{action} API call failed: {message}") from exc


def _extract_openai_text(payload: dict[str, Any]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    texts: list[str] = []
    for item in payload.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) or []:
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str) and text.strip():
                texts.append(text.strip())
    return "\n".join(texts).strip()


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    texts: list[str] = []
    for candidate in payload.get("candidates", []) or []:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        if not isinstance(content, dict):
            continue
        for part in content.get("parts", []) or []:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                texts.append(text.strip())
    return "\n".join(texts).strip()


async def _generate_with_anthropic(
    *,
    model: str,
    action: str,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
    temperature: float | None,
) -> LlmTextResponse:
    if anthropic is None:
        raise HTTPException(status_code=500, detail="Anthropic SDK is not available")

    api_key = provider_api_key("anthropic")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not configured")

    client = anthropic.Anthropic(api_key=api_key)
    request: dict[str, Any] = {
        "model": model,
        "max_tokens": max_output_tokens,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    if system_prompt:
        request["system"] = system_prompt
    if temperature is not None:
        request["temperature"] = temperature

    try:
        message = await asyncio.wait_for(
            asyncio.to_thread(client.messages.create, **request),
            timeout=_provider_timeout_seconds("anthropic"),
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Anthropic request timed out") from exc
    except anthropic.AuthenticationError as exc:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid") from exc
    except Exception as exc:
        _raise_provider_api_error(exc, "anthropic", action)

    text = "\n".join(
        block.text.strip()
        for block in getattr(message, "content", [])
        if getattr(block, "type", "") == "text" and getattr(block, "text", "").strip()
    ).strip()
    return LlmTextResponse(provider="anthropic", model=str(message.model or model), text=text)


async def _generate_with_openai(
    *,
    model: str,
    action: str,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
) -> LlmTextResponse:
    api_key = provider_api_key("openai")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    body: dict[str, Any] = {
        "model": model,
        "input": user_prompt,
        "max_output_tokens": max_output_tokens,
    }
    if system_prompt:
        body["instructions"] = system_prompt

    try:
        payload = await asyncio.wait_for(
            asyncio.to_thread(
                _post_json,
                url="https://api.openai.com/v1/responses",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                body=body,
                timeout_seconds=_provider_timeout_seconds("openai"),
            ),
            timeout=_provider_timeout_seconds("openai"),
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="OpenAI request timed out") from exc
    except Exception as exc:
        _raise_provider_api_error(exc, "openai", action)

    text = _extract_openai_text(payload if isinstance(payload, dict) else {})
    return LlmTextResponse(
        provider="openai",
        model=str((payload or {}).get("model") or model),
        text=text,
    )


async def _generate_with_gemini(
    *,
    model: str,
    action: str,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
    temperature: float | None,
) -> LlmTextResponse:
    api_key = provider_api_key("gemini")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    body: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ]
    }
    if system_prompt:
        body["system_instruction"] = {"parts": [{"text": system_prompt}]}

    generation_config: dict[str, Any] = {"maxOutputTokens": max_output_tokens}
    if temperature is not None:
        generation_config["temperature"] = temperature
    body["generationConfig"] = generation_config

    model_name = urllib.parse.quote(model, safe="")
    try:
        payload = await asyncio.wait_for(
            asyncio.to_thread(
                _post_json,
                url=f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": api_key,
                },
                body=body,
                timeout_seconds=_provider_timeout_seconds("gemini"),
            ),
            timeout=_provider_timeout_seconds("gemini"),
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Gemini request timed out") from exc
    except Exception as exc:
        _raise_provider_api_error(exc, "gemini", action)

    text = _extract_gemini_text(payload if isinstance(payload, dict) else {})
    return LlmTextResponse(
        provider="gemini",
        model=str((payload or {}).get("modelVersion") or model),
        text=text,
    )


async def generate_text(
    *,
    task: str,
    action: str,
    user_prompt: str,
    system_prompt: str = "",
    requested_provider: str | None = None,
    requested_model: str | None = None,
    max_output_tokens: int = 1024,
    temperature: float | None = None,
) -> LlmTextResponse:
    provider = normalize_provider(requested_provider, default_provider())
    model = task_model(provider, task, requested_model)

    if provider == "anthropic":
        return await _generate_with_anthropic(
            model=model,
            action=action,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
        )
    if provider == "openai":
        return await _generate_with_openai(
            model=model,
            action=action,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_output_tokens=max_output_tokens,
        )
    return await _generate_with_gemini(
        model=model,
        action=action,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_output_tokens=max_output_tokens,
        temperature=temperature,
    )


def _run_text_request_sync(request: dict[str, Any]) -> LlmTextResponse:
    return asyncio.run(generate_text(**request))


def generate_text_sync(
    *,
    task: str,
    action: str,
    user_prompt: str,
    system_prompt: str = "",
    requested_provider: str | None = None,
    requested_model: str | None = None,
    max_output_tokens: int = 1024,
    temperature: float | None = None,
) -> LlmTextResponse:
    request = {
        "task": task,
        "action": action,
        "user_prompt": user_prompt,
        "system_prompt": system_prompt,
        "requested_provider": requested_provider,
        "requested_model": requested_model,
        "max_output_tokens": max_output_tokens,
        "temperature": temperature,
    }
    provider = normalize_provider(requested_provider, default_provider())
    timeout_seconds = _provider_timeout_seconds(provider) + 5

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _run_text_request_sync(request)

    result_holder: dict[str, LlmTextResponse] = {}
    error_holder: dict[str, Exception] = {}

    def runner() -> None:
        try:
            result_holder["response"] = _run_text_request_sync(request)
        except Exception as exc:  # pragma: no cover - forwarded to caller
            error_holder["error"] = exc

    worker = threading.Thread(target=runner, daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    if worker.is_alive():
        raise HTTPException(status_code=504, detail=f"{PROVIDER_LABELS[provider]} request timed out")
    if "error" in error_holder:
        raise error_holder["error"]
    return result_holder["response"]
