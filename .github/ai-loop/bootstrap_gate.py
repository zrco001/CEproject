"""One-time gate for one fixed, reviewed settings PR; never approves or merges a PR.

Expected values come from the separately reviewed, frozen manual workflow on the
bootstrap branch. No PR text/input may select the target, code SHA or receipt.
"""
import json
import os
import re

import controller as c
import local_review_gate as gate
from review_manifest import build_manifest

CONTEXT = "ai/single-maintainer-bootstrap"


def target(pr, expected):
    if (not c.eligible(pr) or pr.get("auto_merge") or str(pr["number"]) != expected["pr"]
            or pr["head"]["sha"] != expected["head"] or pr["base"]["sha"] != expected["base"]):
        raise ValueError("Bootstrap target is closed, foreign, changed or not the fixed settings PR")


def approved_evidence(pr, expected, files, comments, ci_ok):
    target(pr, expected)
    if build_manifest(pr, files)["files_sha256"] != expected["files_sha256"]:
        raise ValueError("Settings inventory changed")
    verdict = gate.local_verdict(pr, comments)
    if verdict["decision"] != "human_required":
        raise ValueError("Settings scope must be recorded as human_required")
    result, state, label = gate.evaluate(pr, files, verdict, ci_ok, gate.scope_approved(pr, comments))
    if state != "success":
        raise ValueError("Fixed settings PR still needs exact-head owner approval, Codex review and CI")
    return result, state, label


def status(pr, state, text):
    c.gh(f"statuses/{pr['head']['sha']}", "POST", {"context": CONTEXT, "state": state,
        "description": text[:140],
        "target_url": f"https://github.com/{c.REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"})


def main():
    expected = {k: os.environ[f"BOOTSTRAP_{k.upper()}"] for k in ("pr", "head", "base", "files_sha256")}
    if (not re.fullmatch(r"[1-9][0-9]*", expected["pr"])
            or not all(re.fullmatch(r"[0-9a-f]{40}", expected[k]) for k in ("head", "base"))
            or not re.fullmatch(r"[0-9a-f]{64}", expected["files_sha256"])):
        raise ValueError("Invalid fixed bootstrap values")
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        raise ValueError("Bootstrap must be explicitly dispatched")
    c.maintainers_only()
    pr = c.gh(f"pulls/{expected['pr']}")
    target(pr, expected)
    status(pr, "pending", "Checking fixed settings SHA, owner approval, Codex review and complete CI")
    try:
        c.require_protection(review_mode="single-maintainer")
        protection = c.request(f"{c.API}/repos/{c.REPO}/branches/main/protection",
                               token=os.environ["AI_PROTECTION_READ_TOKEN"])
        checks = protection["required_status_checks"]["checks"]
        if not any(x["context"] == CONTEXT and x.get("app_id") == 15368 for x in checks):
            raise ValueError("One-time bootstrap check must also be required and Actions-bound")
        # CI and Architecture must be unchanged relative to the fixed trusted base.
        for path in (".github/workflows/ci.yml", "docs/ARCHITECTURE.md"):
            base = c.gh(f"contents/{path}?ref={expected['base']}")
            head = c.gh(f"contents/{path}?ref={expected['head']}")
            if base["sha"] != head["sha"]:
                raise ValueError("Bootstrap must preserve trusted CI and core Architecture")
        files = c.changed_data(pr)
        comments = c.pages(f"issues/{pr['number']}/comments")
        ci_ok, _ = c.ci_evidence(pr, {})
        result, state, label = approved_evidence(pr, expected, files, comments, ci_ok)
        if not c.report(pr, result, state, label):
            raise ValueError("PR changed before publishing the gate")
        target(c.gh(f"pulls/{expected['pr']}"), expected)
        status(pr, "success", "Fixed settings PR passed real Codex review, owner approval and CI; human must merge")
    except Exception:
        status(pr, "failure", "Bootstrap stopped; inspect fixed SHA, owner approval, review, CI and protection")
        raise


if __name__ == "__main__":
    main()
