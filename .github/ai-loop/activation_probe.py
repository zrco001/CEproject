"""Temporary read-only activation probe; never prints credentials or response bodies."""
import json
import os
import re
import urllib.error
import urllib.request


def probe(label, url, token, extra=None):
    headers = {"User-Agent": "CEproject-activation-check"}
    if token:
        headers["Authorization"] = "Bearer " + token
    headers.update(extra or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
            data = json.load(response)
            print(f"{label}: HTTP {response.status}")
            return data
    except urllib.error.HTTPError as error:
        print(f"{label}: HTTP {error.code}")
        try:
            details = json.loads(error.read(10000)).get("error", {})
            for field in ("code", "type"):
                value = details.get(field, "")
                if isinstance(value, str) and re.fullmatch(r"[a-z_]+", value):
                    print(f"{label} error {field}: {value}")
            message = details.get("message", "").lower()
            if "credit balance" in message and "low" in message:
                print(f"{label}: provider reports insufficient credit balance")
            if label.startswith("Anthropic"):
                print("Anthropic error categories:", {term: term in message for term in
                      ("credit", "balance", "billing", "api key", "x-api-key", "version", "permission")})
        except Exception:
            pass
        return None


repo = os.environ["GITHUB_REPOSITORY"]
actor = os.environ["GITHUB_ACTOR"]
root = f"https://api.github.com/repos/{repo}"
gh = os.environ["GH_TOKEN"]
pat = os.environ["AI_PROTECTION_READ_TOKEN"]
probe("Actor identity", f"https://api.github.com/users/{actor}", gh)
probe("GITHUB_TOKEN collaborator permission", f"{root}/collaborators/{actor}/permission", gh)
probe("Read-only PAT collaborator permission", f"{root}/collaborators/{actor}/permission", pat)
protection = probe("Read-only PAT main protection", f"{root}/branches/main/protection", pat)
if protection:
    print("Required contexts:", protection.get("required_status_checks", {}).get("contexts"))
key = os.environ["OPENAI_API_KEY"]
probe("OpenAI selected model", "https://api.openai.com/v1/models/" + os.environ["OPENAI_REVIEW_MODEL"], key)
models = probe("OpenAI accessible models", "https://api.openai.com/v1/models", key)
if models:
    print("Accessible review candidates:", sorted(m["id"] for m in models.get("data", [])
          if m["id"].startswith(("gpt-5", "gpt-4.1"))))
probe("Anthropic model access", "https://api.anthropic.com/v1/models", "", {
    "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})

import controller
controller.require_protection()
print("Controller protection check: PASS")
try:
    result = controller.review({"scope_only": True, "task": "Add an ordinary Markdown local quickstart using existing README commands. No application code or protected paths will change."})
    print("OpenAI live structured scope review:", result["decision"])
except Exception as error:
    print("OpenAI live structured scope review:", type(error).__name__, str(error))
    payload = {"model": os.environ["OPENAI_REVIEW_MODEL"], "input": "Reply OK.", "max_output_tokens": 32, "store": False}
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=json.dumps(payload).encode(), headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            print("OpenAI minimal request: HTTP", response.status)
    except urllib.error.HTTPError as response_error:
        details = json.loads(response_error.read(10000)).get("error", {})
        print("OpenAI minimal request: HTTP", response_error.code)
        for field in ("code", "type"):
            value = details.get(field, "")
            if isinstance(value, str) and re.fullmatch(r"[a-z_]+", value):
                print("OpenAI error", field, value)
