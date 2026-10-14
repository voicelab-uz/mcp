# AI pull request review

GitHub Actions reviews each new PR and pushes to its branch through AI&. It posts
one advisory review per base/head revision and review-policy version, with up to
five short inline findings.
It also handles reopened PRs, drafts, ready-for-review events, and base-branch
changes. A branch without an open PR has nowhere to receive PR comments and is
not reviewed. Bot-authored PRs are not intentionally excluded.

## Enable

GitHub Actions must be enabled under **Settings → Actions → General**. When
Actions is disabled, neither the reviewer nor its CI tests will run. Enabling
Actions is a repository-wide setting, so confirm that it fits the repository's
workflow policy before changing it.

1. Merge `.github/ai-review/` and both workflows into the repository's **default
   branch**. The privileged reviewer always runs that branch's implementation.
2. In **Settings → Secrets and variables → Actions → New repository secret**, add
   **`REVIEWER_AI`** with your AI& token. It needs access to the configured models.
   An organization Actions secret named `REVIEWER_AI` with access granted to this
   repository also works. Secrets in another repository are not inherited.
   No GitHub PAT or separate bot account is needed.
3. Open a PR or push a commit to an existing PR. For an existing PR with no new
   commit, use **Actions → AI PR review → Run workflow** and enter its PR number.

The workflow requests `contents: read` and `pull-requests: write` for its automatic
`GITHUB_TOKEN`. If an organization policy blocks writing reviews, allow those
permissions for this workflow. No approval or request-changes permission setting
is needed: the bot submits only `COMMENT` reviews. GitHub may still require an
Actions approval for an external contributor. GitHub restricts secrets and write
tokens for some [Dependabot-triggered runs](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions).
Use **Run workflow** as a maintainer for those PRs; rerunning the original
Dependabot-triggered job does not remove that restriction.

Without an accessible AI& secret, the job fails with a setup message. Nothing is
silently marked reviewed. The local tests mock inference; validate model access
with a real PR after the workflow is enabled.

## Models and review quality

Static model IDs in [config.json](../.github/ai-review/config.json):

| Role | Model | Reasoning |
| --- | --- | --- |
| Review | `zai-org/glm-5.3` | `high` |
| Independent review, security check, and finding verification | `deepseek-ai/deepseek-v4-pro` | `high` |

These IDs and reasoning levels were checked against AI&'s public
[`GET /v1/models` catalog](https://docs.aiand.com/api/models/) on October 15, 2026.
They are capable open-weight coding/reasoning choices, not a guarantee of the
best model for every change. Model access is organization-specific. Update the
IDs deliberately if your account lacks access or your evaluations favor another
model; an unavailable model fails visibly instead of silently downgrading.

The selected profile is **mcp**. The shared [review policy](../.github/ai-review/policy.md)
and [repository skill](../.github/ai-review/skills/mcp/SKILL.md) assess, in order:

1. **Security:** reachable trust-boundary failures, including novel logic flaws.
2. **Readability:** simple ownership/control flow, useful KISS/DRY improvements.
3. **Scalability:** correctness under load/failure, algorithms, bounded resources.
4. **Tests:** meaningful assertions, realistic edge cases and recovery coverage.
5. **Human experience:** clear actions and errors when relevant to this repository.

Each repository loads only its selected stack skill. There is no remote skill
installation or runtime autodetection from untrusted PR files. `config.json` selects
`skills/<profile>/SKILL.md`; a missing or invalid profile fails visibly. Keep the
skill's architectural baseline current when deliberately changing contracts.

The first model reviews the change; the second independently reviews the same
files, checks security and test quality, and challenges every candidate. Discoveries
from the second model get one further verification by the first. Both must agree
before a finding is published. This reduces noise but does not establish model
accuracy or guarantee discovery of every vulnerability, including zero-days.

| Comment label | Meaning |
| --- | --- |
| **Must fix** | A supported security, core correctness, availability or critical test concern to address before merge. |
| **Should fix** | A concrete defect, meaningful coverage gap, resource cost or maintenance/usability problem. |
| **Nice to have** | An explicitly optional improvement with a clear local benefit. |

Comments show both urgency and category, such as **Must fix · Security**. Urgency
ranks first, then the review priorities above; trivial security cleanup cannot
push a serious failure out of the limited comment budget. At most five new inline
comments are posted. Additional verified findings beyond that cap are disclosed.
Questions must identify a real unresolved decision and explain why it matters.
A small code example is included only when it makes the fix clearer.

For example:

> If the provider accepts the job before timing out, this retry charges twice.
> Persist the idempotency key before dispatch and reuse it on retries.

> Can you add or point to a test that delivers the same completion twice?
> Assert that credits are debited once and both attempts return the same result.

Tests, efficiency and simplicity suggestions do not require an existing production
bug. The reviewer names the scenario and expected result; it does not claim missing
coverage across unchanged files it cannot see. UX is marked not applicable for
changes without relevant human-facing behavior. Code review cannot certify visual
quality, actual GPU performance or successful tests.

The bot says **LGTM** when both reviews finish, all changed files have sufficient
coverage, all applicable dimensions are assessed, and no actionable or still-current
existing concerns remain. Skipped files, invalid findings and missing context
produce an incomplete verdict. Deduplicating a concern never turns it into LGTM.
Reviews always use GitHub's advisory `COMMENT` state. Labels do not block merging;
the bot never approves, requests changes through GitHub, merges, or edits code.

## Scope, limits, and repeats

Only PR-changed files are sent for review. The payload contains their full diffs
plus bounded, numbered context from those same files, the PR title/description,
and up to 60 existing inline comments relevant to each batch. Findings must point
to an added line (`RIGHT`) or deleted line (`LEFT`). Unchanged files are never
fetched; the model cannot independently inspect callers or run the project.

The default limits are 80 files, 40,000 diff characters per file, 24,000 context
characters per file, four batches of up to 100,000 serialized file characters,
and 16,384 completion tokens **including reasoning** per model call. Each batch
uses two review calls, plus one verification call if the second model discovers
additional eligible findings. There is no recursive review loop. Transient
429/502/503/504 responses retry at most once. Inference is billed to your AI&
account. Keep the limits bounded if increasing them; the job times out at 35 minutes.

Generated files, lockfiles, media, known credential paths, missing/truncated
patches, and over-budget files are explicitly listed as **not reviewed** in the
review. Limited file context is also disclosed. The path filter is a practical
exclusion list, not a secret scanner; code, PR text, and comments are sent to AI&.
GitHub API failures or incomplete file listings stop publication. Invalid model
findings are discarded and called out as partial validation. An API/model failure
never produces a successful no-findings review.

Pushes cancel older runs. The reviewer checks the current base/head before
inference and publication, and pins the review to its captured head commit.
Re-running a completed base/head revision skips inference and duplicate reviews.
An interrupted run that did not publish can be rerun. The model sees existing
comments to avoid repeated concerns; stable finding markers also suppress exact
repeats on live lines after line numbers shift. This is not perfect semantic
deduplication. Outdated threads remain available for humans; the bot never
resolves discussion threads or responds automatically to replies.

## Trust boundary

The commenting workflow uses `pull_request_target` to get credentials for fork
PRs, following [GitHub's trigger guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).
It checks out only the review code from this repository's default branch, with
Git credentials disabled. It never checks out or executes the PR branch, runs
its scripts/tests, installs its dependencies, or downloads its artifacts. File
contents arrive through the GitHub API as data and are never written to disk.

PR text, code, and previous comments are untrusted model input. Models have no
tools, shell, GitHub credentials, or ability to choose network destinations.
The runner validates paths, changed-line anchors, priority, category, confidence, length,
and output content before posting. Links, mentions, HTML, and exact credential
echoes are rejected. Both reviews must explicitly assess all five review dimensions;
missing assessments stop publication. API response bodies and model reasoning are not logged.
Review text remains AI-generated advice; prompt-injection defenses and a second
model reduce risk but cannot guarantee factual correctness.

Changes to the reviewer take effect only after merging into the default branch.
Keep its files under normal maintainer review. Bump the runner policy `VERSION`
when changing review behavior so a manually rerun revision can use the new policy.
The separate `AI reviewer tests`
workflow uses `pull_request` with read-only permissions and **no AI& secret** to
test proposed changes safely. Production release checks remain separate.

## Verify and troubleshoot

Run the dependency-free tests with Node 22 or newer:

```sh
node --test .github/ai-review/review.test.mjs
```

The tests use mocked GitHub and AI& responses; they cover changed-line validation,
deletions/renames, partial diffs, budgets, duplicate reviews, force-pushes, judge
rejection, missed security findings, standalone test requests, incomplete
assessments, profile isolation, priority ranking, comment limits, optional UX,
LGTM gating, API failures, and safe publication. They do not evaluate
model accuracy.

After adding the secret, use a small real PR to check the workflow's run summary
and its inline comments. A complete clean review receives LGTM without inline findings.
If a run fails, inspect **Actions → AI PR review → Review changed code**:

- Missing key: add `REVIEWER_AI` to repository Actions secrets.
- HTTP 401/403: verify token access and GitHub workflow permissions.
- HTTP 404: verify both configured model IDs are accessible to your AI& account.
- HTTP 429: check AI& credits/rate limits, then rerun the failed job.
- Token limit/invalid JSON: no review is published; adjust the batch/output limits
  or use a model that supports AI&'s structured output surface.
- GitHub HTTP 422: check whether the PR changed during publication, then rerun.

Treat this as an advisory workflow alongside repository CI and human review.
It is not configured as a required merge gate.
