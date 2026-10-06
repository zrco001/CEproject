"""Verify maintainer-attested local Codex review and exact-head CI; no model API calls."""
import json
import os
import re
import sys
from pathlib import Path

import controller as c
from policy import MAX_BYTES, risk_paths, validate_verdict

MARKER = "<!-- local-ai-review -->"


def parse_report(body, head):
    if not isinstance(body, str) or len(body.encode()) > MAX_BYTES or not body.startswith(MARKER):
        raise ValueError("Missing or oversized local review")
    raw = body[len(MARKER):].strip()
    if raw.startswith("```json\n") and raw.endswith("\n```"):
        raw = raw[8:-4]
    record = json.loads(raw)
    if set(record) != {"head_sha", "engine", "decision", "summary", "findings"}:
        raise ValueError("Invalid local review fields")
    if record["engine"] != "codex" or not re.fullmatch(r"[0-9a-f]{40}", record["head_sha"]) or record["head_sha"] != head:
        raise ValueError("Stale or unidentified local reviewer")
    return validate_verdict({k: record[k] for k in ("decision", "summary", "findings")})


def local_verdict(pr, comments):
    # This is a maintainer attestation of an actual local AI review, not cryptographic
    # proof of a model run. Bot/self-generated attestations are never accepted.
    for comment in sorted(comments, key=lambda x: (x.get("updated_at", ""), x["id"]), reverse=True):
        if not comment.get("body", "").startswith(MARKER) or comment["user"]["type"] != "User":
            continue
        login = comment["user"]["login"]
        if c.gh(f"collaborators/{login}/permission")["permission"] not in ("write", "maintain", "admin"):
            continue
        # Newest authorized report is authoritative. Malformed/stale cannot fall back
        # to an older favorable report, including edited comments.
        return parse_report(comment["body"], pr["head"]["sha"])
    raise ValueError("A human maintainer must post the actual local Codex review for this head")


def evaluate(pr, files, verdict, ci_ok, human):
    if verdict["decision"] == "changes_requested":
        return verdict, "failure", "ai:changes-requested"
    if risk_paths(files) or verdict["decision"] == "human_required":
        if human and ci_ok:
            return {"summary": "Sensitive scope: local review recorded, independent human approved this head, CI passed", "findings": []}, "success", "ai:ready-to-merge"
        return {"summary": "Sensitive scope requires supervised implementation and independent human approval on this exact head", "findings": verdict["findings"]}, "failure", "ai:human-required"
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
        if not event["issue"].get("pull_request") or not comment.get("body", "").startswith(MARKER) or comment["user"]["type"] != "User":
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
        c.require_protection()
        files = c.changed_data(pr)
        verdict = local_verdict(pr, c.pages(f"issues/{pr['number']}/comments"))
        ci_ok, _ = c.ci_evidence(pr, event)
        result, state, label = evaluate(pr, files, verdict, ci_ok, c.approved(pr))
        c.report(pr, result, state, label)
    except Exception as exc:
        c.report(pr, {"summary": "Local gate stopped: current-head review, protection, or CI evidence needs human attention", "findings": []}, "failure", "ai:human-required")
        print(f"Local gate stopped: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
