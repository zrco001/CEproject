## Problem and resulting behavior

<!-- State the assigned phase/task and the concrete before/after behavior. -->

## Architecture and sensitive scope

- [ ] Read Architecture Approved v0.3; core architecture unchanged.
- [ ] No destructive DB operation, production migration, or deployment.
- [ ] No security, tenant/project isolation, or financial-rule change.
- [ ] If sensitive scope exists: human-approved plan and current-head review are linked below;
      automated implementation remains stopped.

Human approval / ADR / Phase gate links:

## Validation

<!-- Link CI for this exact head and list actual checks/results, including limitations. -->

- [ ] Formatting, lint, typecheck, tests, build, Docker checks passed.
- [ ] AI loop guardrail tests and workflow validation passed.
- [ ] Current head has `ai/review-gate` success, or the documented bootstrap exception applies.

## Final human gate

- [ ] A human maintainer reviewed the exact current commit and applicable risk/rollback plan.
- [ ] Merge is performed manually by a human. Auto-merge is disabled.

<!-- Checkboxes and labels are descriptive. They do not authorize or override enforced checks. -->
