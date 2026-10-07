"""Bind a supervised full-patch review to GitHub's complete exact-head file inventory.

This receipt is evidence of reviewed scope, not proof of who performed the review.
It never relaxes the automated editor/model budgets or grants human approval.
"""
import hashlib
import json
import re
import subprocess
import sys

from policy import MAX_FILES, safe_path


def sha(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) is not None


def natural(value):
    return type(value) is int and value >= 0


def build_manifest(pr, files):
    if not sha(pr["head"]["sha"]) or not sha(pr["base"]["sha"]):
        raise ValueError("Invalid head/base SHA")
    if (not isinstance(files, list) or not files or len(files) > MAX_FILES
            or len(files) != pr["changed_files"]):
        raise ValueError("Incomplete or oversized supervised inventory")
    rows = []
    for f in files:
        previous = f.get("previous_filename")
        if (not safe_path(f.get("filename")) or previous is not None and not safe_path(previous)
                or not sha(f.get("sha"))
                or f.get("status") not in {"added", "removed", "modified", "renamed", "copied", "changed", "unchanged"}
                or not natural(f.get("additions")) or not natural(f.get("deletions"))
                or not natural(f.get("changes")) or f["changes"] != f["additions"] + f["deletions"]):
            raise ValueError("Invalid supervised file evidence")
        rows.append({k: f[k] for k in ("filename", "sha", "status", "additions", "deletions")}
                    | {"previous_filename": previous})
    if len({f["filename"] for f in rows}) != len(rows):
        raise ValueError("Duplicate supervised file evidence")
    additions = sum(f["additions"] for f in rows)
    deletions = sum(f["deletions"] for f in rows)
    if additions != pr["additions"] or deletions != pr["deletions"]:
        raise ValueError("Supervised inventory totals do not match the PR")
    inventory = {"base_sha": pr["base"]["sha"], "head_sha": pr["head"]["sha"],
                 "files": sorted(rows, key=lambda f: f["filename"])}
    digest = hashlib.sha256(json.dumps(inventory, sort_keys=True, separators=(",", ":"),
                                       ensure_ascii=False).encode()).hexdigest()
    return {"format": "github-files-v1", "base_sha": inventory["base_sha"],
            "head_sha": inventory["head_sha"], "changed_files": len(rows),
            "additions": additions, "deletions": deletions, "files_sha256": digest}


def verify_manifest(record, pr, files):
    expected = build_manifest(pr, files)
    if not isinstance(record, dict) or record != expected:
        raise ValueError("Supervised review receipt is stale or incomplete")
    # bool == int in Python; disallow misleading counter encodings.
    if any(not natural(record[k]) for k in ("changed_files", "additions", "deletions")):
        raise ValueError("Invalid supervised review counters")
    return files


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[1-9][0-9]*", sys.argv[1]):
        raise ValueError("Usage: python review_manifest.py <PR number>")
    root = "repos/zrco001/CEproject"
    def read(args):
        return json.loads(subprocess.run(["gh", "api", *args], check=True,
                                        capture_output=True).stdout)
    pr = read([f"{root}/pulls/{sys.argv[1]}"])
    if (pr["state"] != "open" or pr["base"]["ref"] != "main"
            or pr["head"]["repo"]["full_name"] != "zrco001/CEproject"):
        raise ValueError("Only an open same-repository main PR is supported")
    files = [f for page in read([f"{root}/pulls/{sys.argv[1]}/files?per_page=100",
                                "--paginate", "--slurp"]) for f in page]
    current = read([f"{root}/pulls/{sys.argv[1]}"])
    if any(current[side]["sha"] != pr[side]["sha"] for side in ("head", "base")):
        raise ValueError("PR changed while producing the review receipt")
    print(json.dumps(build_manifest(pr, files), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
