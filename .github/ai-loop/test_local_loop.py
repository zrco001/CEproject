"""Subscription and local-review security boundaries."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import controller as c
import local_claude as implementation
import local_review_gate as gate
from policy import safe_path

HEAD = "a" * 40


def verdict(decision="approve"):
    return {"decision": decision, "summary": "Reviewed", "findings": []}


def body(head=HEAD, decision="approve"):
    return gate.MARKER + "\n" + json.dumps({"engine": "codex", "head_sha": head, **verdict(decision)})


class LocalGuards(unittest.TestCase):
    def test_windows_drive_stream_and_alias_paths_rejected(self):
        for name in ("C:/outside.md", "docs/plain.md:stream", "docs/../outside.md", "docs/plain.md.", "docs/plain.md "):
            self.assertFalse(safe_path(name))

    def test_api_or_unknown_login_cannot_run_a_subscription_attempt(self):
        valid = {"loggedIn": True, "authMethod": "claude.ai", "apiProvider": "firstParty", "subscriptionType": "pro"}
        implementation.require_subscription(valid, 0)
        for changes in ({"authMethod": "api_key"}, {"apiProvider": "bedrock"}, {"subscriptionType": None}, {"loggedIn": False}):
            with self.assertRaises(ValueError):
                implementation.require_subscription({**valid, **changes}, 0)
        with self.assertRaises(ValueError):
            implementation.require_subscription(valid, 1)

    def test_child_environment_never_uses_api_credentials_or_proxy_provider(self):
        env = implementation.subscription_env({"PATH": "safe", "ANTHROPIC_API_KEY": "secret",
              "ANTHROPIC_BASE_URL": "proxy", "OPENAI_API_KEY": "secret", "GH_TOKEN": "secret",
              "CLAUDE_CODE_USE_BEDROCK": "1", "CLAUDE_CODE_OAUTH_TOKEN": "secret", "OTHER_SECRET": "secret"})
        self.assertEqual(env["PATH"], "safe")
        self.assertFalse(any(k in env for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "GH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_OAUTH_TOKEN", "OTHER_SECRET")))
        self.assertEqual(env["CLAUDE_CODE_DISABLE_FAST_MODE"], "1")
        self.assertEqual(env["CLAUDE_CODE_MAX_RETRIES"], "0")

    def test_protected_instruction_deletion_discards_patch(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / "docs").mkdir()
            (root / "docs/plain.md").write_text("ordinary")
            with self.assertRaises(ValueError):
                implementation.export(root, {"CLAUDE.md": "before"})

    def test_protected_architecture_edit_discards_patch(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / "docs").mkdir()
            (root / "docs/ARCHITECTURE.md").write_text("changed")
            with self.assertRaises(ValueError):
                implementation.export(root, {})

    def test_ordinary_text_export_requires_codex_review(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / "docs").mkdir()
            (root / "docs/plain.md").write_text("ordinary")
            self.assertEqual(implementation.export(root, {}), {"docs/plain.md": "ordinary"})

    def test_stale_or_unknown_reviewer_cannot_pass(self):
        for value in (body("b" * 40), body().replace('"codex"', '"claude"'), gate.MARKER + "\n{}"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                gate.parse_report(value, HEAD)

    def test_blocking_findings_cannot_be_called_approval(self):
        raw = {"head_sha": HEAD, "engine": "codex", **verdict()}
        raw["findings"] = [{"path": "docs/plain.md", "severity": "blocking", "description": "fix"}]
        with self.assertRaises(ValueError):
            gate.parse_report(gate.MARKER + json.dumps(raw), HEAD)

    def test_bot_attestation_is_not_accepted(self):
        with self.assertRaises(ValueError), patch.object(c, "gh") as gh:
            gate.local_verdict({"head": {"sha": HEAD}}, [{"id": 1, "body": body(), "user": {"type": "Bot", "login": c.BOT}}])
        gh.assert_not_called()

    def test_newest_authorized_stale_report_blocks_old_approval(self):
        comments = [{"id": 1, "body": body(), "updated_at": "1", "user": {"type": "User", "login": "maintainer"}},
                    {"id": 2, "body": body("b" * 40), "updated_at": "2", "user": {"type": "User", "login": "maintainer"}}]
        with patch.object(c, "gh", return_value={"permission": "write"}), self.assertRaises(ValueError):
            gate.local_verdict({"head": {"sha": HEAD}}, comments)

    def test_unprivileged_report_cannot_replace_review(self):
        with patch.object(c, "gh", return_value={"permission": "read"}), self.assertRaises(ValueError):
            gate.local_verdict({"head": {"sha": HEAD}}, [{"id": 1, "body": body(), "user": {"type": "User", "login": "outsider"}}])

    def test_missing_ci_stays_pending(self):
        self.assertEqual(gate.evaluate({}, [{"filename": "docs/plain.md"}], verdict(), False, True)[1], "pending")

    def test_sensitive_scope_requires_both_ci_and_independent_human(self):
        files = [{"filename": "packages/db/schema.prisma"}]
        for ci, human in ((True, False), (False, True), (False, False)):
            self.assertEqual(gate.evaluate({}, files, verdict(), ci, human)[1], "failure")
        self.assertEqual(gate.evaluate({}, files, verdict("human_required"), True, True)[1], "success")

    def test_human_approval_does_not_override_blocking_codex_findings(self):
        self.assertEqual(gate.evaluate({}, [{"filename": ".github/workflows/ci.yml"}], verdict("changes_requested"), True, True)[1], "failure")

    def test_semantic_sensitive_scope_in_ordinary_path_stops(self):
        self.assertEqual(gate.evaluate({}, [{"filename": "apps/api/src/plain.ts"}], verdict("human_required"), True, False)[2], "ai:human-required")

    def test_ordinary_pass_records_status_but_never_submits_human_review(self):
        self.assertEqual(gate.evaluate({}, [{"filename": "docs/plain.md"}], verdict(), True, False)[1], "success")


if __name__ == "__main__":
    unittest.main()
