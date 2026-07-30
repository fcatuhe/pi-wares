---
name: pr-description
description: Structure for a feature pull request body. Use when writing or rewriting a PR description, a merge request body, or a release note for a feature branch, and when asked to open a PR with gh.
---

# PR description

Fixed core structure. Conditional sections only when they carry information. Omit empty sections, never leave a heading with "N/A" under it.

Order: **Summary -> User flow -> Behavior changes -> Visual changes -> Implementation notes -> Design decisions -> Data and rollout -> Risks and edge cases -> Tests**.

| Section | Include | Content |
| --- | --- | --- |
| Summary | Always | The user problem, the new capability, the outcome. One short paragraph. |
| User flow | Usually | How the user enters, completes and exits the feature, including the exceptional paths. |
| Behavior changes | Always | Before and after, as a compact table. |
| Visual changes | With UI | Screenshots by screen and viewport. |
| Implementation notes | Always | Model, controller, Turbo, job and integration decisions. Not a list of changed files. |
| Design decisions | When useful | Alternatives considered and why they lost. |
| Data and rollout | When applicable | Migrations, backfills, feature gates, configuration, compatibility, deployment order. |
| Risks and edge cases | Substantial features | Concurrency, permissions, failure behavior, recovery. |
| Tests | Always | Tested behavior by level: model, controller, system, job, integration. |
| Screenshots footer | With images | Where the long-lived screenshot assets live. |
