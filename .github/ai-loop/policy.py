"""Fail-closed, conservative boundaries for automated edits (trusted default branch)."""
import re

MAX_ATTEMPTS = 3
MAX_FILES = 80
MAX_BYTES = 160_000
LABELS = {
    "ai:enabled": ("5319e7", "Maintainer opted this PR into bounded local subscription collaboration"),
    "ai:changes-requested": ("d93f0b", "CI or local Codex review requires changes on the current head"),
    "ai:human-required": ("b60205", "Automation paused: sensitive scope, error, or exhausted budget"),
    "ai:ready-to-merge": ("0e8a16", "Current head passed CI and review; human must merge"),
}


def safe_path(path):
    return (isinstance(path, str) and bool(path) and "\\" not in path and ":" not in path
            and not path.startswith("/") and all(p not in ("", ".", "..") and not p.endswith((".", " ")) for p in path.split("/")))


def protected(path):
    """Broad matching intentionally includes new modules, tests, and renamed old paths."""
    p = path.lower()
    if not safe_path(path):
        return True
    if p.startswith((".github/", ".claude/", "packages/db/", "packages/contracts/",
                     "packages/config/", "packages/shared/", "scripts/", "docs/adr/")):
        return True
    if p in ("claude.md", "agents.md", ".mcp.json", "docs/architecture.md"):
        return True
    if any(part in (".claude", ".git", "node_modules", "migrations") for part in p.split("/")):
        return True
    if re.search(r"(^|[/._-])(auth|security|tenant|permission|rbac|csrf|crypto|session|"
                 r"repository|reporting|payment|payable|receivable|receipt|expense|billing|"
                 r"settlement|allocation|retention|revenue|tax|money|financial|audit|guard)([/._-]|$)", p):
        return True
    if p.endswith((".sql", ".prisma", ".pem", ".key", ".p12", ".pfx")):
        return True
    if p.split("/")[-1] in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
                             "dockerfile", "docker-compose.yml", "turbo.json", ".env.example"):
        return True
    if any(part.startswith(".env") for part in p.split("/")):
        return True
    # Only application source and ordinary documentation may be changed automatically.
    return not p.startswith(("apps/web/src/", "apps/api/src/", "apps/api/test/", "docs/"))


def risk_paths(files):
    return sorted({p for f in files for p in (f["filename"], f.get("previous_filename"))
                   if p and protected(p)})


def validate_changes(changes):
    if not isinstance(changes, dict) or not changes or len(changes) > MAX_FILES:
        raise ValueError("Empty or oversized changeset")
    if any(protected(p) for p in changes):
        raise ValueError("Protected or unsafe path: human implementation required")
    if any(v is not None and not isinstance(v, str) for v in changes.values()):
        raise ValueError("Only UTF-8 regular text files are supported")
    if sum(len((v or "").encode()) for v in changes.values()) > MAX_BYTES:
        raise ValueError("Changeset exceeds review budget")
    if any(re.search(r"\bsk-(?:ant-|proj-|svcacct-)?[A-Za-z0-9_-]{16,}", v or "") for v in changes.values()):
        raise ValueError("Possible provider credential in generated text; human required")


def validate_verdict(result):
    if set(result) != {"decision", "summary", "findings"}:
        raise ValueError("Invalid reviewer response")
    if result["decision"] not in ("approve", "changes_requested", "human_required"):
        raise ValueError("Invalid reviewer decision")
    if not isinstance(result["summary"], str) or not isinstance(result["findings"], list):
        raise ValueError("Invalid reviewer fields")
    for f in result["findings"]:
        if set(f) != {"path", "severity", "description"} or not all(isinstance(v, str) for v in f.values()):
            raise ValueError("Invalid finding")
        if f["severity"] not in ("blocking", "advisory"):
            raise ValueError("Invalid severity")
    if result["decision"] == "approve" and any(f["severity"] == "blocking" for f in result["findings"]):
        raise ValueError("Approval contradicts blocking findings")
    return result
