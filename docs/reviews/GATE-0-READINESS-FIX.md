# Gate 0 readiness correction

## Observed failure

[Run 37730226660](https://github.com/zrco001/CEproject/actions/runs/37730226660) used main `66bcae9d02a4ecddad406d9537fc1d342669e14f` and `native-candidate`. All 123 offline tests passed and the PostgreSQL image/container were created, but the final readiness check returned `/var/run/postgresql:5432 - no response` and exit 2. The PoC runner was skipped, no Gate report artifacts were produced, and disposable container/tmpfs cleanup succeeded. G0-1 through G0-8 were not executed.

## Correction and evidence limits

Both readiness probes now explicitly check container-local TCP at `127.0.0.1:5432`. The [official PostgreSQL image entrypoint](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh) starts a temporary socket-only server (`listen_addresses=''`) during initialization, stops it, then starts the permanent server. This supports a readiness-race diagnosis; the failed run did not capture container startup logs, so its exact internal sequence is not independently confirmed.

The change preserves the image version, manual confirmation/strategy allowlist, 60-attempt bound, fail-fast behavior, loopback publication, tmpfs/auto-removal, database guards, timeout and always-cleanup. No schema, migration, constraint, architecture or permission changes are included.

The offline shell regression tests execute only the extracted readiness block, with docker and sleep stubbed. They cover permanent TCP readiness after transient initialization, the original socket-only negative control, and the never-ready failure. No Docker/DB/Prisma commands are executed by the tests. The extractor also normalizes Windows CRLF line endings, with a fourth regression case. The sleep stub verifies the finite attempt bound rather than elapsed time. Actual results and exact-head CI are recorded by the coordinating review; these simulations are not Gate 0 evidence.

## Implementation and remaining gate

The human approved this limited correction. A subscription-only Claude Code proposal timed out after four minutes without changing any files; its attempt ledger remains intact. Codex implemented the small correction and tests directly rather than restarting that background call. Codex authored and verified this patch; the timed-out Claude Code call is not credited as an implementation or review. A separate Claude subscription chat reviewed the supplied workflow/test excerpt, reported no blocking findings, and recommended CRLF normalization, which is included. Claude did not run tests or tools. That supplementary excerpt review is distinct from the coordinating full-PR verification.

This patch does not run a new DB PoC, accept Gate 0/ADR-034, generate a formal schema, or authorize AI merge. The completed protected version still needs exact-head owner approval and manual merge. A new disposable DB run requires fresh explicit execution authorization.
