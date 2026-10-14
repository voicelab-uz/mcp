# AI pull request review

VoiceLab Reviewer runs on our 5090 server through a GitHub App. Automatic reviews
and comment replies use **no GitHub Actions runner minutes**. Model calls still
use the shared AI& account; regular CI and commits triggered by formatting still
use the repository's normal CI infrastructure.

## When it runs

- Open, push to, reopen, or mark a PR ready: review after a 60-second debounce.
- Changing the base branch also triggers a fresh review; title/body edits do not.
- Drafts receive review, but no automatic fixes. Branches without a PR do not.
- Existing PRs: comment `@reviewer review`. An unchanged base/head revision already
  reviewed under the current server policy skips inference and duplicate comments.
  Enabling formal decisions may require one fresh review of an older revision.
- Merge conflicts do not stop review of the available diff. The reviewer neither
  resolves conflicts nor merges the PR. Push a conflict resolution to review again.

## Talk to it

Reply directly to one of its inline comments for a short explanation. Threads
created by the previous Actions reviewer are supported too. Or use:

```text
@reviewer explain Which edge cases should this test cover?
@reviewer review
@reviewer fix
```

Replies provide advice; they do not edit code. PR authors and collaborators can
ask questions. Explicit review/fix commands require repository write access.
Questions see bounded context from changed files only; ask in the relevant inline
thread when possible. The app does not read the entire repository or run project tests.

## Review criteria

This repository uses the **mcp** profile. The deployed app bundles
one profile per repository and never loads instructions or tools from a PR.

1. Security and trust boundaries, including new logic vulnerabilities.
2. Readability, KISS/DRY, and maintainability.
3. Scalability, algorithms, bounded resources, and failure handling.
4. Meaningful tests, assertions, and edge cases.
5. Human experience where relevant to this stack.

`zai-org/glm-5.3` reviews; `deepseek-ai/deepseek-v4-pro` independently checks the
same files and challenges findings. New findings receive verification. Both use
high reasoning. Comments identify changed lines and label **Must fix**, **Should
fix**, or **Nice to have**. Questions identify missing evidence or a real decision;
examples explain the fix when useful. Confirmed Must fix issues produce a GitHub
**Request changes** review. Questions and optional suggestions remain comments.
No reviewer can guarantee that every vulnerability will be found.

**LGTM** appears only after complete review with no remaining actionable concerns.
Missing context, skipped files, and incomplete output are disclosed. Failures show
in the **VoiceLab AI reviewer** check and never produce LGTM. The app cannot prove
runtime performance, UI appearance, or test success from a diff.

## Approval, verification, and explanations

The app **approves** only when the current revision has a complete clean review,
no unresolved earlier findings, and passing CI. Drafts, merge conflicts, incomplete
context, skipped files, failed/pending checks, and missing CI hold approval.
At least one independent GitHub Actions check must pass; the reviewer cannot count
its own check as CI. Product CI must already exist for the changed code. Many
VoiceLab repos currently have reviewer tests only, so product PRs may correctly
remain unapproved until product checks are added.

CI is rechecked every five minutes using cached review metadata, without another
model call. A changed head/base or failed CI rerun withdraws this app's approval;
human approvals are untouched. Merge-commit checks are accepted only when their
parents match the reviewed base and head. Human merge-time checks remain important
because GitHub reads and review writes are not atomic.

On the next revision, both models independently verify earlier app findings against
current changed files. They resolve only the app's own threads when evidence is
sufficient and both agree. An outdated line or a reply saying “fixed” is not proof.
Missing context leaves the thread open. Human-resolved threads still receive the
normal fresh code review.

A separate **What changed** comment is updated, rather than added repeatedly. It
explains concrete behavior changes, with one short engineering note or example
when useful. Deletion suggestions require evidence that the changed code is unused
or replaced; missing references in a partial diff are not enough. The app never
automatically deletes files or rewrites logic.

**Merging stays manual.** The team reads the changes and uses squash and merge.
The app never merges, enables auto-merge, or adds PRs to a merge queue. Its approval
does not count as a human review or enforce repository branch protections.

## Small automatic fixes

For non-draft PR branches in this repository, a push from a collaborator with
write access can produce one small formatting commit. Eligible languages are Go,
Python, JavaScript, and TypeScript. The formatter runs separately without network,
credentials, repository configuration, plugins, or project code execution.

The parsed syntax must stay equivalent and formatting must be idempotent. Limits:
three regular files and 40 added/removed lines total. Sensitive paths, workflows,
deployment files, generated files, symlinks, executable files, forks, and default
branches are excluded. Unsupported files (including Markdown/MDX) still get review.
Logic, security, billing, and test changes remain suggestions for developers.
Commits use an atomic expected-head guard; a simultaneous push aborts the fix.
Bot commits are reviewed once and cannot start another automatic formatting loop.
Application tests run separately in normal CI; the reviewer does not claim to run them.

## Operations and fallback

The app is restricted by a server repository allowlist. Code, policy, profiles,
installation steps, and operational details live in
[back/tools/reviewer-app](https://github.com/voicelab-uz/back/tree/main/tools/reviewer-app).
Only deploying a trusted release changes the running app; editing a PR or merging
a profile does not silently update the server.

The server loads `REVIEWER_AI` privately through systemd. GitHub Actions secrets
are retained only for **AI PR review (manual fallback)**. If the service is down,
run that workflow from Actions with a PR number. Avoid simultaneous manual and app
reviews. Restoring the previous pull_request_target trigger is the automatic rollback.
Normal CI remains separate and unchanged.

Signed webhooks enter a durable queue; repeated deliveries deduplicate and rapid
pushes coalesce. Defaults: 150 model calls/day overall, 60/repository, up to four
batches and five comments per review. These are request caps, not a currency limit.
Changed source, PR text, and relevant comments go to AI& after best-effort
redaction of common credentials and personal data. Known credential paths skip.
Recognizable credential formats are also flagged locally without sending values
to the models; sensitive output is rejected. These checks do not replace dedicated
secret scanning and cannot find every secret or PII leak. Credentials, model
reasoning, and response bodies are not logged. Untrusted PR text has no shell or GitHub tools.

On failure, inspect the reviewer check. For AI& 401/403, verify account/model access;
429 means provider rate/credit limits; 5xx indicates provider failure. Ambiguous
model POSTs are not automatically retried, preventing unbounded billing. After
resolving the cause, use `@reviewer review`. Daily budget exhaustion requires waiting
for the UTC reset or deliberately adjusting the server cap. Delivery failures can
be redelivered from the App's Advanced settings; GitHub does not redeliver them automatically.
