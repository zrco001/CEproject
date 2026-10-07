"""Supervised receipts must not become an automated-budget or human-approval bypass."""
import copy
import json
import unittest
from unittest.mock import patch

import controller as c
import local_review_gate as gate
from policy import MAX_BYTES, MAX_FILES
from review_manifest import build_manifest, verify_manifest


class SupervisedReview(unittest.TestCase):
    def setUp(self):
        self.pr = {"number": 10, "head": {"sha": "a" * 40}, "base": {"sha": "b" * 40},
                   "changed_files": 1, "additions": 5000, "deletions": 0}
        self.files = [{"filename": "poc/gate-0/README.md", "sha": "c" * 40,
                       "status": "added", "additions": 5000, "deletions": 0, "changes": 5000,
                       "patch": "+" + "x" * (MAX_BYTES + 1)}]
        self.verdict = {"decision": "human_required", "summary": "Full patch reviewed", "findings": []}
        self.record = {"head_sha": self.pr["head"]["sha"], "engine": "codex", **self.verdict,
                       "review_manifest": build_manifest(self.pr, self.files)}
        self.comments = [{"id": 1, "user": {"type": "User", "login": "maintainer"},
                          "body": gate.MARKER + json.dumps(self.record)}]

    def test_receipt_binds_every_file_blob_path_status_count_and_base_head(self):
        verify_manifest(self.record["review_manifest"], self.pr, self.files)
        for field, value in (("sha", "d" * 40), ("filename", "poc/other.md"),
                             ("status", "modified"), ("previous_filename", "poc/old.md")):
            files = copy.deepcopy(self.files)
            files[0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                verify_manifest(self.record["review_manifest"], self.pr, files)
        for side in ("head", "base"):
            pr = copy.deepcopy(self.pr)
            pr[side]["sha"] = "d" * 40
            with self.subTest(side=side), self.assertRaises(ValueError):
                verify_manifest(self.record["review_manifest"], pr, self.files)

    def test_inventory_rejects_missing_duplicate_oversized_or_inconsistent_files(self):
        bad = copy.deepcopy(self.files)
        bad[0]["additions"] = 4999
        for files in ([], self.files * 2, self.files * (MAX_FILES + 1), bad):
            with self.subTest(count=len(files)), self.assertRaises(ValueError):
                build_manifest(self.pr, files)
        for field, value in (("filename", "../outside"), ("sha", "fake"),
                             ("additions", True), ("status", "unknown")):
            files = copy.deepcopy(self.files)
            files[0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                build_manifest(self.pr, files)

    def test_receipt_rejects_forged_digest_missing_fields_and_boolean_counts(self):
        receipt = self.record["review_manifest"]
        malformed = {**receipt, "files_sha256": "0" * 64}
        missing = {k: v for k, v in receipt.items() if k != "base_sha"}
        for value in (malformed, missing, {**receipt, "changed_files": True}, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify_manifest(value, self.pr, self.files)

    def test_receipt_is_independent_of_api_file_order(self):
        second = {**self.files[0], "filename": "poc/second.md"}
        pr = {**self.pr, "changed_files": 2, "additions": 10000}
        self.assertEqual(build_manifest(pr, [self.files[0], second]),
                         build_manifest(pr, [second, self.files[0]]))

    def test_ordinary_review_still_uses_the_original_bounded_diff(self):
        raw = {k: v for k, v in self.record.items() if k != "review_manifest"}
        comments = [{**self.comments[0], "body": gate.MARKER + json.dumps(raw)}]
        with patch.object(c, "gh", return_value={"permission": "write"}), \
                patch.object(c, "changed_data", side_effect=ValueError("Diff exceeds budget")) as bounded:
            with self.assertRaises(ValueError):
                gate.reviewed_changes(self.pr, comments)
            bounded.assert_called_once_with(self.pr)

    def test_supervised_path_requires_separate_owner_approval_and_human_required_verdict(self):
        with patch.object(c, "gh", return_value={"permission": "write"}), \
                patch.object(gate, "scope_approved", return_value=False), patch.object(c, "pages") as pages:
            with self.assertRaises(ValueError):
                gate.reviewed_changes(self.pr, self.comments)
            pages.assert_not_called()
        raw = {**self.record, "decision": "approve"}
        comments = [{**self.comments[0], "body": gate.MARKER + json.dumps(raw)}]
        with patch.object(c, "gh", return_value={"permission": "write"}), \
                patch.object(gate, "scope_approved", return_value=True), self.assertRaises(ValueError):
            gate.reviewed_changes(self.pr, comments)

    def test_full_receipt_with_real_separate_approval_can_be_evaluated_but_ci_remains_required(self):
        with patch.object(c, "gh", return_value={"permission": "write"}), \
                patch.object(gate, "scope_approved", return_value=True), \
                patch.object(c, "pages", return_value=self.files), patch.object(c, "changed_data") as bounded:
            files, verdict = gate.reviewed_changes(self.pr, self.comments)
            bounded.assert_not_called()
            self.assertEqual(gate.evaluate(self.pr, files, verdict, False, True)[1], "failure")
            self.assertEqual(gate.evaluate(self.pr, files, verdict, True, True)[1], "success")

    def test_human_approval_never_overrides_blocking_findings_with_receipt(self):
        verdict = {**self.verdict, "findings": [{"path": "poc/README.md", "severity": "blocking",
                                                "description": "unsafe"}]}
        self.assertEqual(gate.evaluate(self.pr, self.files, verdict, True, True)[1], "failure")

    def test_base_change_during_run_cannot_publish_a_stale_success(self):
        current = copy.deepcopy(self.pr)
        current["base"]["sha"] = "d" * 40
        with patch.object(c, "gh", return_value=current) as gh:
            self.assertFalse(c.report(self.pr, self.verdict, "success", "ai:ready-to-merge"))
            self.assertEqual(gh.call_count, 1)

    def test_deleted_owner_approval_event_refreshes_gate_and_missing_record_stays_blocked(self):
        comment = {"id": 2, "user": {"type": "User", "login": "owner"},
                   "body": gate.HUMAN_MARKER + "{}"}
        event = {"action": "deleted", "comment": comment,
                 "issue": {"number": 10, "pull_request": {"url": "example"}}}
        def gh(path):
            return {"permission": "admin"} if path.endswith("/permission") else self.pr
        with patch.object(c, "gh", side_effect=gh):
            self.assertEqual(gate.select_pr(event), self.pr)
        self.assertFalse(gate.scope_approved(self.pr, self.comments))


if __name__ == "__main__":
    unittest.main()
