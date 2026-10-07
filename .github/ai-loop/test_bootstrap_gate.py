import copy
import unittest
from unittest.mock import patch

import bootstrap_gate as bootstrap
import controller as c
import local_review_gate as gate
from review_manifest import build_manifest


class BootstrapGuards(unittest.TestCase):
    def setUp(self):
        self.pr = {"number": 11, "state": "open", "head": {"sha": "a" * 40,
                   "repo": {"full_name": c.REPO}}, "base": {"sha": "b" * 40, "ref": "main"},
                   "changed_files": 1, "additions": 1, "deletions": 0}
        self.files = [{"filename": ".github/ai-loop/local_review_gate.py", "sha": "c" * 40,
                       "status": "modified", "additions": 1, "deletions": 0, "changes": 1}]
        self.expected = {"pr": "11", "head": "a" * 40, "base": "b" * 40,
                         "files_sha256": build_manifest(self.pr, self.files)["files_sha256"]}
        self.verdict = {"decision": "human_required", "summary": "Reviewed settings", "findings": []}

    def test_only_fixed_open_same_repo_settings_pr_can_receive_bootstrap(self):
        bootstrap.target(self.pr, self.expected)
        for change in ({"number": 10}, {"state": "closed"}, {"auto_merge": {"enabled": True}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                bootstrap.target({**self.pr, **change}, self.expected)
        for side, key, value in (("head", "sha", "d" * 40), ("base", "sha", "d" * 40),
                                 ("base", "ref", "other"), ("head", "repo", {"full_name": "other/repo"})):
            pr = copy.deepcopy(self.pr)
            pr[side][key] = value
            with self.subTest(side=side, key=key), self.assertRaises(ValueError):
                bootstrap.target(pr, self.expected)

    def test_actual_owner_approval_ci_and_nonblocking_review_are_all_required(self):
        for human, ci, decision, findings in ((False, True, "human_required", []),
                (True, False, "human_required", []), (True, True, "approve", []),
                (True, True, "human_required", [{"path": ".github/plain", "severity": "blocking", "description": "fix"}])):
            with patch.object(gate, "scope_approved", return_value=human), \
                    patch.object(gate, "local_verdict", return_value={**self.verdict,
                        "decision": decision, "findings": findings}), self.assertRaises(ValueError):
                bootstrap.approved_evidence(self.pr, self.expected, self.files, [], ci)
        with patch.object(gate, "scope_approved", return_value=True), \
                patch.object(gate, "local_verdict", return_value=self.verdict):
            self.assertEqual(bootstrap.approved_evidence(self.pr, self.expected, self.files, [], True)[1], "success")

    def test_changed_inventory_cannot_reuse_fixed_bootstrap_review(self):
        files = copy.deepcopy(self.files)
        files[0]["sha"] = "d" * 40
        with patch.object(gate, "local_verdict") as review, self.assertRaises(ValueError):
            bootstrap.approved_evidence(self.pr, self.expected, files, [], True)
        review.assert_not_called()


if __name__ == "__main__":
    unittest.main()
