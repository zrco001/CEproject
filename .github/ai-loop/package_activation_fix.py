"""One-time, exact-commit packaging and gate checks; never calls any model API."""
import os
import controller as c
import local_review_gate as gate
from policy import risk_paths

INFRA = "33eb50da98973925883a661cea4183f216fdf8a8"
OLD = "f04465f458bf1f12dacddec53161920d9dbb3c7a"
SMOKE = "295c671f0068fa19cdbe02efa85499b86ab7d5da"
BASE = "13695473a6e66f10552f5515806dbec9f85f8c1f"
PLANS = [
    {"sha": INFRA, "parent": OLD, "branch": "codex/ai-settings-endpoint", "number": 3,
     "files": {".github/ai-loop/controller.py", ".github/ai-loop/test_loop.py"},
     "title": "Use existing Claude/Codex subscriptions with no model API billing",
     "body": "Claude implementation now runs locally with the existing Claude subscription. Codex independently reviews exported proposals and passes feedback directly to Claude; GitHub only verifies exact-head local review attestation, CI and human guardrails. Removes all model secrets/calls and cloud implementation jobs from the active workflow.\n\nAdds a bounded subscription-only local runner and 16 new guard tests (41 total passing locally). Preserves Architecture Approved v0.3 byte-for-byte, financial/security/migration stops, enforced main protection and manual final merge. Also fixes the repository settings URL and the wrapped GitHub Actions jobs response that blocked activation; includes real API-envelope and pagination regression coverage.\n\nActual smoke: Claude Pro wrote a quickstart, Codex requested corrections, Claude revised it on attempt 2; a separate draft PR contains that documentation. No API inference, new credits or extra usage were used. Claude extra usage and auto reload are OFF; monthly extra spending limit is US$0.\n\nValidation: local 41 guard tests, actionlint and formatting passed. Full CI for this exact SHA is dispatched separately. Bootstrap gate remains human-required until independent human approval on this exact commit and successful CI. Prepared by Codex; Actions packages this draft so the owner can review independently. AI never approves or merges.\n\nAfter manual merge, enable the replacement AI Development Loop. Do not enable the old API workflow. Only AI_PROTECTION_READ_TOKEN remains in use (expires 2026-11-06); OpenAI/Anthropic API secrets are unused."},
    {"sha": SMOKE, "parent": BASE, "branch": "claude/local-smoke-issue-2", "number": None,
     "files": {"docs/LOCAL-DEVELOPMENT-QUICKSTART.md"},
     "title": "docs: local Claude Pro and Codex collaboration smoke",
     "body": "Closes #2\n\nClaude Pro produced the quickstart using existing subscription quota. Codex independently reviewed the full export against README and .env.example, requested explicit unverified-runtime wording and Traditional Chinese, then reviewed Claude's second attempt. Only ordinary documentation changes; no architecture, code, migration, security, tenant or financial changes.\n\nLocal formatting passed. Full exact-head CI is dispatched separately. Neither agent started the application, and the document clearly states that runtime behavior was not tested. No model API key or additional model payment was used. This PR stays draft for human review and manual merge.\n\nThe maintainer account posts the actual local Codex review as a SHA-bound attestation; this is not a GitHub APPROVE review."},
]


def checked_pr(plan):
    prs = c.gh("pulls?state=open&head=" + c.REPO.split("/")[0] + ":" + plan["branch"])
    if len(prs) != 1:
        raise ValueError("Expected exactly one open prepared PR")
    pr = c.gh("pulls/" + str(prs[0]["number"]))
    if not c.eligible(pr) or pr["head"]["sha"] != plan["sha"] or pr.get("auto_merge"):
        raise ValueError("Prepared PR moved or is ineligible")
    return pr


c.maintainers_only()
c.require_protection()
for plan in PLANS:
    commit = c.gh("commits/" + plan["sha"])
    if len(commit["parents"]) != 1 or commit["parents"][0]["sha"] != plan["parent"] or {f["filename"] for f in commit["files"]} != plan["files"]:
        raise ValueError("Prepared commit scope or parent changed")

if os.environ["FIX_MODE"] == "publish-free":
    for plan in PLANS:
        if plan["number"]:
            pr = c.gh(f"pulls/{plan['number']}")
            if not c.eligible(pr) or pr["head"]["ref"] != plan["branch"] or pr["head"]["sha"] not in (OLD, INFRA) or not pr["draft"]:
                raise ValueError("Bootstrap PR no longer matches reviewed publication target")
            if pr["head"]["sha"] == OLD:
                c.gh("git/refs/heads/" + plan["branch"], "PATCH", {"sha": plan["sha"], "force": False})
            c.gh(f"pulls/{plan['number']}", "PATCH", {"title": plan["title"], "body": plan["body"]})
        else:
            prs = c.gh("pulls?state=open&head=" + c.REPO.split("/")[0] + ":" + plan["branch"])
            if not prs:
                c.gh("git/refs", "POST", {"ref": "refs/heads/" + plan["branch"], "sha": plan["sha"]})
                c.gh("pulls", "POST", {"head": plan["branch"], "base": "main", "draft": True, "title": plan["title"], "body": plan["body"]})
        pr = checked_pr(plan)
        c.status(pr, "pending", "Waiting for exact-head CI and actual local Codex attestation")
        if not c.ci_evidence(pr, {})[0]:
            c.dispatch_ci(pr)
        print("Prepared draft PR:", pr["html_url"])
elif os.environ["FIX_MODE"] == "review-free":
    for plan in PLANS:
        pr = checked_pr(plan)
        verdict = gate.local_verdict(pr, c.pages(f"issues/{pr['number']}/comments"))
        files = c.changed_data(pr)
        ci_ok, _ = c.ci_evidence(pr, {})
        result, state, label = gate.evaluate(pr, files, verdict, ci_ok, c.approved(pr))
        c.report(pr, result, state, label)
        print("Verified exact head:", pr["number"], state)
else:
    raise ValueError("Unknown no-API operator mode")
