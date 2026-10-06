"""Regression tests for authority boundaries, stale heads, budgets, and failure modes."""
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import controller as c
from policy import protected, risk_paths, validate_changes, validate_verdict


def pr():
    return {"number": 9, "state": "open", "base": {"ref": "main"}, "labels": [],
            "head": {"sha": "a" * 40, "ref": "claude/test", "repo": {"full_name": c.REPO}},
            "user": {"login": "author"}, "changed_files": 1, "auto_merge": None}


class PolicyTests(unittest.TestCase):
    def test_sensitive_and_new_paths_require_human(self):
        for path in ("docs/ARCHITECTURE.md", "apps/api/src/modules/new/tenant.guard.ts",
                     "apps/api/src/modules/auth/new.ts", "apps/web/src/new/payment.tsx",
                     "packages/shared/src/money/money.test.ts", "packages/db/new.prisma",
                     "new/migrations/001.sql", ".github/workflows/new.yml", "apps/api/package.json",
                     ".env.production", "docs/../ordinary.md", "docs\\ordinary.md", "/docs/a.md"):
            with self.subTest(path=path):
                self.assertTrue(protected(path))

    def test_ordinary_source_allowed(self):
        for path in ("apps/web/src/components/shell/menu.tsx", "apps/api/src/health/health.ts", "docs/reviews/phase.md"):
            self.assertFalse(protected(path))

    def test_rename_cannot_evade_guard(self):
        self.assertEqual(risk_paths([{"filename": "docs/ordinary.md", "previous_filename": "docs/ARCHITECTURE.md"}]), ["docs/ARCHITECTURE.md"])

    def test_payload_types_size_and_empty_fail(self):
        for value in ({}, {"docs/a.md": "x" * 160001}, {"docs/a.md": 1}, {".github/a": "x"}):
            with self.assertRaises(ValueError):
                validate_changes(value)
        validate_changes({"docs/a.md": "ordinary", "docs/b.md": None})

    def test_approval_with_blocking_finding_rejected(self):
        with self.assertRaises(ValueError):
            validate_verdict({"decision": "approve", "summary": "ok", "findings": [
                {"path": "a", "severity": "blocking", "description": "bug"}]})


class OrchestrationTests(unittest.TestCase):
    def test_stale_review_has_no_side_effect(self):
        newer = pr()
        newer["head"]["sha"] = "b" * 40
        with patch.object(c, "gh", return_value=newer) as gh:
            self.assertFalse(c.report(pr(), {"summary": "pass", "findings": []}, "success", "ai:ready-to-merge"))
            self.assertEqual(gh.call_count, 1)

    def test_attempt_budget_and_duplicate_head(self):
        comment = lambda body: {"body": body, "user": {"login": c.BOT}}
        prefix = "<!-- ai-attempt:9:" + "a" * 40 + ":1 -->"
        with patch.object(c, "gh") as gh:
            self.assertFalse(c.reserve(pr(), [comment(prefix)]))
            self.assertFalse(c.reserve(pr(), [comment(f"<!-- ai-attempt:9:{i}:1 -->") for i in range(3)]))
            gh.assert_not_called()
            self.assertTrue(c.reserve(pr(), []))
            self.assertEqual(gh.call_count, 1)

    def test_spoofed_attempt_comment_not_authority(self):
        with patch.object(c, "gh"):
            comments = [{"body": "<!-- ai-attempt:9:" + "a" * 40 + ":1 -->", "user": {"login": "attacker"}}]
            self.assertTrue(c.reserve(pr(), comments))

    def test_foreign_and_wrong_base_pr_rejected(self):
        for repo, base in (("other/repo", "main"), (c.REPO, "development")):
            value = pr()
            value["head"]["repo"]["full_name"] = repo
            value["base"]["ref"] = base
            self.assertFalse(c.eligible(value))

    def test_dispatch_sha_does_not_confuse_main_with_target(self):
        self.assertEqual(c.ci_sha({"event": "workflow_dispatch", "head_sha": "b" * 40,
                                 "display_title": "CI / PR #9 / " + "a" * 40}), "a" * 40)
        self.assertIsNone(c.ci_sha({"event": "workflow_dispatch", "head_sha": "b" * 40, "display_title": "fake"}))

    def test_skipped_and_missing_ci_jobs_fail(self):
        run = {"id": 1, "path": ".github/workflows/ci.yml", "event": "pull_request",
               "head_sha": "a" * 40, "conclusion": "success"}
        with patch.object(c, "pages", return_value=[{"name": "verify", "conclusion": "success"}, {"name": "docker", "conclusion": "skipped"}]):
            ok, failed = c.ci_evidence(pr(), {"workflow_run": run})
            self.assertFalse(ok)
            self.assertEqual(failed, ["docker", "ai-loop-tests"])

    def test_human_approval_must_match_head_and_latest_review(self):
        old = {"user": {"login": "human", "type": "User"}, "state": "APPROVED", "commit_id": "b" * 40}
        current = copy.deepcopy(old)
        current["commit_id"] = "a" * 40
        changed = copy.deepcopy(current)
        changed["state"] = "CHANGES_REQUESTED"
        with patch.object(c, "gh", return_value={"permission": "write"}):
            for reviews, expected in (([old], False), ([current], True), ([current, changed], False)):
                with patch.object(c, "pages", return_value=reviews):
                    self.assertEqual(c.approved(pr()), expected)

    def test_bots_cannot_approve_sensitive_scope(self):
        review = {"user": {"login": "bot", "type": "Bot"}, "state": "APPROVED", "commit_id": "a" * 40}
        with patch.object(c, "pages", return_value=[review]), patch.object(c, "gh") as gh:
            self.assertFalse(c.approved(pr()))
            gh.assert_not_called()

    def test_incomplete_refused_and_malformed_review_fail_closed(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only", "OPENAI_REVIEW_MODEL": "test-model"}):
            for value in ({"status": "incomplete"}, {"status": "completed", "output": [{"content": [{"type": "refusal"}]}]},
                          {"status": "completed", "output": [{"content": [{"type": "output_text", "text": "bad"}]}]}):
                with patch.object(c, "request", return_value=value), self.assertRaises(ValueError):
                    c.review({"task": "ordinary"})

    def test_no_keys_never_calls_provider(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(c, "request") as request:
            with self.assertRaises(ValueError):
                c.review({})
            request.assert_not_called()

    def test_truncated_diff_and_incomplete_file_list_fail(self):
        with patch.object(c, "pages", return_value=[]), self.assertRaises(ValueError):
            c.changed_data(pr())
        with patch.object(c, "pages", return_value=[{"filename": "docs/a", "changes": 2,
                        "additions": 2, "deletions": 0, "patch": "@@ -0,0 +1,2 @@\n+one"}]), self.assertRaises(ValueError):
            c.changed_data(pr())

    def test_publish_discards_patch_after_head_moves(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = os.getcwd()
            try:
                os.chdir(directory)
                Path("plan.json").write_text(json.dumps({"pr": 9, "sha": "b" * 40, "branch": "claude/test"}))
                Path("changes.json").write_text(json.dumps({"docs/a.md": "ordinary"}))
                with patch.object(c, "gh", return_value=pr()) as gh, patch.object(c, "review") as review:
                    with self.assertRaises(ValueError):
                        c.publish()
                    self.assertEqual(gh.call_count, 1)
                    review.assert_not_called()
            finally:
                os.chdir(previous)

    def test_protection_requires_all_gates_and_human_reviews(self):
        protection = {"enforce_admins": {"enabled": True}, "required_pull_request_reviews": {
            "required_approving_review_count": 1, "dismiss_stale_reviews": True, "require_code_owner_reviews": True},
            "required_status_checks": {"contexts": ["verify", "docker", "ai-loop-tests", c.CONTEXT]}}
        with patch.dict(os.environ, {"AI_PROTECTION_READ_TOKEN": "test-only"}), patch.object(c, "gh", return_value={"allow_auto_merge": False}):
            with patch.object(c, "request", return_value=protection):
                c.require_protection()
            protection["required_status_checks"]["contexts"].remove(c.CONTEXT)
            with patch.object(c, "request", return_value=protection), self.assertRaises(ValueError):
                c.require_protection()


if __name__ == "__main__":
    unittest.main()
