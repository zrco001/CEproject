"""Verify maintainer-attested local Codex review and exact-head CI; no model API calls."""
import json
import os
import re
import sys
from pathlib import Path

import controller as c
from policy import MAX_BYTES, risk_paths, validate_verdict
from review_manifest import verify_manifest

MARKER = "<!-- local-ai-review -->"
HUMAN_MARKER = "<!-- human-scope-approval -->"
MARKERS = (MARKER, HUMAN_MARKER)


def parse_report(body, head):
    if not isinstance(body, str) or len(body.encode()) > MAX_BYTES or not body.startswith(MARKER):
        raise ValueError("Missing or oversized local review")
    raw = body[len(MARKER):].strip()
    if raw.startswith("```json\n") and raw.endswith("\n```"):
        raw = raw[8:-4]
    record = json.loads(raw)
    fields = {"head_sha", "engine", "decision", "summary", "findings"}
    if set(record) not in (fields, fields | {"review_manifest"}):
        raise ValueError("Invalid local review fields")
    if record["engine"] != "codex" or not re.fullmatch(r"[0-9a-f]{40}", record["head_sha"]) or record["head_sha"] != head:
        raise ValueError("Stale or unidentified local reviewer")
    return validate_verdict({k: record[k] for k in ("decision", "summary", "findings")})


def local_verdict(pr, comments, include_record=False):
    # This is a maintainer attestation of an actual local AI review, not cryptographic
    # proof of a model run. Bot identities are never accepted.
    for comment in sorted(comments, key=lambda x: (x.get("updated_at", ""), x["id"]), reverse=True):
        if not comment.get("body", "").startswith(MARKER) or comment["user"]["type"] != "User":
            continue
        login = comment["user"]["login"]
        if c.gh(f"collaborators/{login}/permission")["permission"] not in ("write", "maintain", "admin"):
            continue
        # Newest authorized report is authoritative. Malformed/stale cannot fall back
        # to an older favorable report, including edited comments.
        verdict = parse_report(comment["body"], pr["head"]["sha"])
        raw = comment["body"][len(MARKER):].strip()
        if raw.startswith("```json\n") and raw.endswith("\n```"):
            raw = raw[8:-4]
        return (verdict, json.loads(raw)) if include_record else verdict
    raise ValueError("A human maintainer must post the actual local Codex review for this head")


def scope_approved(pr, comments):
    """Explicit current-head approval by the personal repository owner, including PR authors.

    The owner must actually approve the supervised scope; AI must never invent this record.
    Like local review attestations, account identity is not proof of who operated the account.
    """
    owner = c.REPO.split("/", 1)[0]
    for comment in sorted(comments, key=lambda x: (x.get("updated_at", ""), x["id"]), reverse=True):
        text = comment.get("body", "")
        user = comment.get("user", {})
        if not text.startswith(HUMAN_MARKER) or user.get("type") != "User" or user.get("login") != owner:
            continue
        if c.gh(f"collaborators/{owner}/permission")["permission"] != "admin":
            return False
        # Latest owner record is authoritative: revocation, edits and stale records cannot
        # fall back to an earlier approval. A label or local AI review is never approval.
        try:
            if len(text.encode()) > MAX_BYTES:
                return False
            record = json.loads(text[len(HUMAN_MARKER):].strip())
            return (isinstance(record, dict) and set(record) == {"head_sha", "decision", "scope"}
                    and isinstance(record["head_sha"], str)
                    and re.fullmatch(r"[0-9a-f]{40}", record["head_sha"])
                    and record["head_sha"] == pr["head"]["sha"]
                    and record["decision"] == "approve"
                    and isinstance(record["scope"], str) and bool(record["scope"].strip()))
        except (ValueError, TypeError):
            return False
    return False


def reviewed_changes(pr, comments):
    verdict, record = local_verdict(pr, comments, include_record=True)
    if "review_manifest" not in record:
        return c.changed_data(pr), verdict
    # Only a supervised full-patch review may use this path. Do not raise automated
    # input/export budgets, trust a label, or treat this attestation as human approval.
    if verdict["decision"] != "human_required" or not scope_approved(pr, comments):
        raise ValueError("Supervised receipt needs human_required review and exact-head owner approval")
    files = c.pages(f"pulls/{pr['number']}/files")
    return verify_manifest(record["review_manifest"], pr, files), verdict


def evaluate(pr, files, verdict, ci_ok, human):
    if verdict["decision"] == "changes_requested" or any(f["severity"] == "blocking" for f in verdict["findings"]):
        return verdict, "failure", "ai:changes-requested"
    if risk_paths(files) or verdict["decision"] == "human_required":
        if human and ci_ok:
            return {"summary": "Sensitive scope: local review recorded, maintainer explicitly approved this head, CI passed; human must merge", "findings": []}, "success", "ai:ready-to-merge"
        return {"summary": "Sensitive scope requires supervised implementation and explicit maintainer approval on this exact head", "findings": verdict["findings"]}, "failure", "ai:human-required"
    if not ci_ok:
        return {"summary": "Local review recorded; successful CI for this exact head is still required", "findings": []}, "pending", "ai:changes-requested"
    return verdict, "success", "ai:ready-to-merge"


def select_pr(event):
    if event.get("workflow_run"):
        sha = c.ci_sha(event["workflow_run"])
        prs = [p for p in c.pages("pulls?state=open") if p["head"]["sha"] == sha and p["base"]["ref"] == "main"]
        return c.gh(f"pulls/{prs[0]['number']}") if len(prs) == 1 else None
    if event.get("comment"):
        comment = event["comment"]
        if not event["issue"].get("pull_request") or not comment.get("body", "").startswith(MARKERS) or comment["user"]["type"] != "User":
            return None
        if c.gh(f"collaborators/{comment['user']['login']}/permission")["permission"] not in ("write", "maintain", "admin"):
            return None
        return c.gh(f"pulls/{event['issue']['number']}")
    if event.get("pull_request"):
        return c.gh(f"pulls/{event['pull_request']['number']}")
    c.maintainers_only()
    return c.gh(f"pulls/{int(os.environ['PR_NUMBER'])}")


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    pr = select_pr(event)
    if not pr or not c.eligible(pr):
        return
    try:
        c.status(pr, "pending", "Checking local Codex attestation and current-head CI")
        c.require_protection(review_mode="single-maintainer")
        comments = c.pages(f"issues/{pr['number']}/comments")
        files, verdict = reviewed_changes(pr, comments)
        ci_ok, _ = c.ci_evidence(pr, event)
        result, state, label = evaluate(pr, files, verdict, ci_ok, scope_approved(pr, comments))
        c.report(pr, result, state, label)
    except Exception as exc:
        c.report(pr, {"summary": "Local gate stopped: current-head review, protection, or CI evidence needs human attention", "findings": []}, "failure", "ai:human-required")
        print(f"Local gate stopped: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
