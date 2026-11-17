from __future__ import annotations

from typing import Any

import httpx

from .models import ProviderConfig


class ProviderError(RuntimeError):
    pass


def _endpoint(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


async def generate(config: ProviderConfig, system: str, prompt: str) -> str:
    """Call the configured model provider with a small, bounded request."""
    if config.provider != "local" and not config.api_key:
        raise ProviderError("No API key is configured for this provider.")

    # Local models on CPU can be slow; give them more room.
    if config.provider == "local":
        timeout = httpx.Timeout(300.0, connect=10.0)
    else:
        timeout = httpx.Timeout(45.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            if config.provider in {"openai", "local"}:
                if config.provider == "openai":
                    url = _endpoint(config.base_url, "chat/completions")
                    headers = {"Authorization": f"Bearer {config.api_key}"}
                else:
                    url = _endpoint(config.base_url, "api/chat")
                    headers = {}
                if config.provider == "local":
                    body = {
                        "model": config.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                        "think": False,
                        "options": {"temperature": 0.7, "num_predict": 600},
                    }
                else:
                    body = {
                        "model": config.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 900,
                    }
                response = await client.post(url, headers=headers, json=body)
                response.raise_for_status()
                data = response.json()
                if config.provider == "local":
                    message = data.get("message", {})
                    content = (message.get("content") or "").strip()
                    if not content:
                        content = (message.get("thinking") or "").strip()
                    return content
                return data["choices"][0]["message"]["content"].strip()

            if config.provider == "anthropic":
                url = _endpoint(config.base_url, "v1/messages")
                response = await client.post(
                    url,
                    headers={
                        "x-api-key": config.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": config.model,
                        "max_tokens": 900,
                        "system": system,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                response.raise_for_status()
                blocks = response.json().get("content", [])
                text = "\n".join(block.get("text", "") for block in blocks if block.get("type") == "text")
                return text.strip()

            if config.provider == "google":
                url = _endpoint(
                    config.base_url,
                    f"models/{config.model}:generateContent?key={config.api_key}",
                )
                response = await client.post(
                    url,
                    json={
                        "systemInstruction": {"parts": [{"text": system}]},
                        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 900},
                    },
                )
                response.raise_for_status()
                candidates = response.json().get("candidates", [])
                if not candidates:
                    raise ProviderError("The provider returned no candidates.")
                parts = candidates[0].get("content", {}).get("parts", [])
                return "\n".join(part.get("text", "") for part in parts).strip()

            raise ProviderError(f"Unsupported provider: {config.provider}")
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            raise ProviderError(f"{exc.response.status_code} from provider: {detail}") from exc
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Unexpected provider response: {exc}") from exc
        except httpx.RequestError as exc:
            raise ProviderError(f"Could not reach provider: {exc}") from exc


async def check_connection(config: ProviderConfig) -> tuple[bool, str]:
    if config.provider != "local" and not config.api_key:
        return False, "No API key configured."

    timeout = httpx.Timeout(20.0, connect=8.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            if config.provider == "openai":
                response = await client.get(
                    _endpoint(config.base_url, "models"),
                    headers={"Authorization": f"Bearer {config.api_key}"},
                )
            elif config.provider == "anthropic":
                response = await client.get(
                    _endpoint(config.base_url, "v1/models"),
                    headers={
                        "x-api-key": config.api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
            elif config.provider == "google":
                response = await client.get(
                    _endpoint(config.base_url, f"models?key={config.api_key}")
                )
            else:
                response = await client.get(_endpoint(config.base_url, "api/tags"))
            response.raise_for_status()
            return True, "Provider connection verified."
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                return False, "The provider rejected this API key."
            return False, f"Provider returned HTTP {exc.response.status_code}."
        except httpx.RequestError:
            return False, "Could not reach the provider. Check the base URL and network."


def provider_label(config: ProviderConfig) -> str:
    if not config.api_key and config.provider != "local":
        return "studio-demo"
    return f"{config.provider}:{config.model}"


async def chat(config: ProviderConfig, messages: list[dict[str, str]], model: str | None = None) -> str:
    """Multi-turn chat. Returns the assistant's reply text."""
    model = model or config.model
    timeout = httpx.Timeout(300.0 if config.provider == "local" else 60.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            if config.provider in {"openai", "local"}:
                if config.provider == "openai":
                    url = _endpoint(config.base_url, "chat/completions")
                    headers = {"Authorization": f"Bearer {config.api_key}"}
                else:
                    url = _endpoint(config.base_url, "api/chat")
                    headers = {}
                if config.provider == "local":
                    body = {
                        "model": model,
                        "messages": messages,
                        "stream": False,
                        "think": False,
                        "options": {"temperature": 0.7, "num_predict": 600},
                    }
                else:
                    body = {
                        "model": model,
                        "messages": messages,
                        "temperature": 0.7,
                        "max_tokens": 900,
                    }
                response = await client.post(url, headers=headers, json=body)
                response.raise_for_status()
                data = response.json()
                if config.provider == "local":
                    msg = data.get("message", {})
                    content = (msg.get("content") or "").strip()
                    if not content:
                        content = (msg.get("thinking") or "").strip()
                    return content
                return data["choices"][0]["message"]["content"].strip()

            if config.provider == "anthropic":
                url = _endpoint(config.base_url, "v1/messages")
                # separate system from messages
                system_text = ""
                user_msgs = []
                for m in messages:
                    if m.get("role") == "system":
                        system_text = m.get("content", "")
                    else:
                        user_msgs.append(m)
                response = await client.post(
                    url,
                    headers={
                        "x-api-key": config.api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 900,
                        "system": system_text,
                        "messages": user_msgs,
                    },
                )
                response.raise_for_status()
                blocks = response.json().get("content", [])
                return "\\n".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()

            if config.provider == "google":
                url = _endpoint(config.base_url, f"models/{model}:generateContent?key={config.api_key}")
                # flatten messages into contents
                contents = []
                system_text = ""
                for m in messages:
                    if m.get("role") == "system":
                        system_text = m.get("content", "")
                    else:
                        role = "user" if m.get("role") == "user" else "model"
                        contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})
                body = {"contents": contents, "generationConfig": {"temperature": 0.7, "maxOutputTokens": 900}}
                if system_text:
                    body["systemInstruction"] = {"parts": [{"text": system_text}]}
                response = await client.post(url, json=body)
                response.raise_for_status()
                candidates = response.json().get("candidates", [])
                if not candidates:
                    raise ProviderError("The provider returned no candidates.")
                parts = candidates[0].get("content", {}).get("parts", [])
                return "\\n".join(p.get("text", "") for p in parts).strip()

            raise ProviderError(f"Unsupported provider: {config.provider}")
        except httpx.HTTPStatusError as exc:
            raise ProviderError(f"{exc.response.status_code} from provider: {exc.response.text[:500]}") from exc
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Unexpected provider response: {exc}") from exc
        except httpx.RequestError as exc:
            raise ProviderError(f"Could not reach provider: {exc}") from exc


def provider_status_payload(config: ProviderConfig) -> dict[str, Any]:
    return {
        "provider": config.provider,
        "model": config.model,
        "configured": bool(config.api_key) or config.provider == "local",
    }
