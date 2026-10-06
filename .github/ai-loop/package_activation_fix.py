"""Publish this exact agent-prepared fix for independent human owner review."""
import json
import os
from pathlib import Path

import controller as c

FIX = "87dc9e47e56a0a0effaa7c8da14cbfb97054ff98"
BASE = "13695473a6e66f10552f5515806dbec9f85f8c1f"
BRANCH = "codex/ai-settings-endpoint"
ALLOWED = {".github/ai-loop/controller.py", ".github/ai-loop/test_loop.py"}

c.maintainers_only()
c.require_protection()
commit = c.gh("commits/" + FIX)
if commit["parents"][0]["sha"] != BASE or {f["filename"] for f in commit["files"]} != ALLOWED:
    raise ValueError("Unexpected fix commit or file scope")

mode = os.environ["FIX_MODE"]
if mode == "publish-fix":
    c.gh("git/refs", "POST", {"ref": "refs/heads/" + BRANCH, "sha": FIX})
    pr = c.gh("pulls", "POST", {"head": BRANCH, "base": "main", "draft": True,
        "title": "Fix AI loop activation: repository settings endpoint",
        "body": "The activation smoke test stops with HTTP 404 because the repository settings request has a trailing slash. Omit that slash for root requests and preserve nested resource paths.\n\nAdds two regression tests; all 22 local guard tests pass. No architecture or application changes.\n\nPrepared by Codex and published by GitHub Actions for independent human owner review. AI does not approve or merge this PR.\n\nThe loop remains disabled because OpenAI reports credit_balance_exhausted. A one-time operator-dispatched review-fix helper can evaluate this exact commit after human approval and successful CI, using the repaired controller and the same protected-path/human gate. It cannot merge, edit files, bypass protection, or make AI provider requests."})
    c.dispatch_ci(pr)
    print("Created reviewable draft PR:", pr["html_url"])
elif mode == "review-fix":
    prs = c.gh("pulls?state=open&head=" + c.REPO.split("/")[0] + ":" + BRANCH)
    if len(prs) != 1 or prs[0]["head"]["sha"] != FIX:
        raise ValueError("Expected one open PR on the exact fix head")
    pr = c.gh("pulls/" + str(prs[0]["number"]))
    if not c.approved(pr):
        raise ValueError("Independent human approval on the exact head is required first")
    if not c.ci_evidence(pr, {})[0]:
        raise ValueError("Successful current-head CI is required first")
    os.environ.update({"MODE": "review", "PR_NUMBER": str(pr["number"]), "AI_LOOP_ENABLED": "true"})
    Path("operator-event.json").write_text(json.dumps({}))
    os.environ["GITHUB_EVENT_PATH"] = "operator-event.json"
    c.plan()
else:
    raise ValueError("Unexpected helper mode")
