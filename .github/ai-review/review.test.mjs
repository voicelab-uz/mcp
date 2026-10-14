import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  deduplicate, fileContext, githubClient, makeBatches, modelClient, parsePatch,
  loadGuidance, prepareFiles, requestJSON, reviewBody, runReview, skipReason, validateFindings, VERIFY_SCHEMA,
} from './review.mjs';

const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const base = 'a'.repeat(40), head = 'b'.repeat(40);
const pr = {
  state: 'open', head: { sha: head }, base: { sha: base, ref: 'main' },
  changed_files: 1, title: 'Update worker', body: 'Retry failures safely.',
};
const file = {
  filename: 'internal/worker.go', status: 'modified', sha: 'c'.repeat(40),
  additions: 1, deletions: 1, changes: 2,
  patch: '@@ -1,3 +1,3 @@\n package worker\n-old()\n+newCall()\n done()',
};
const finding = {
  path: file.filename, line: 2, side: 'RIGHT', priority: 'must_fix', kind: 'issue',
  category: 'scalability',
  title: 'Preserve the idempotency key on retry',
  body: 'If the provider accepts the job before timing out, this retry charges twice. Persist and reuse the original idempotency key.',
  evidence: 'The newCall invocation replaces the idempotent old invocation on the retry path.', confidence: 0.96,
};
const prepared = () => ({ path: file.filename, patch: file.patch, anchors: parsePatch(file), context: null });
const assessment = () => ({
  coverage: { security: 'reviewed', readability: 'reviewed', scalability: 'reviewed', tests: 'reviewed', ux: 'reviewed' },
  has_existing_concerns: false,
});
const reviewResult = (findings = []) => ({ findings, ...assessment() });
const judgeResult = (accepted_ids = [], missed_findings = []) => ({ accepted_ids, missed_findings, ...assessment() });

function fixture(overrides = {}) {
  const published = [], modelCalls = [], contextCalls = [];
  let current = structuredClone(pr);
  const github = {
    async getPR() { return structuredClone(current); },
    async list(path) {
      if (path.endsWith('/files')) return [structuredClone(file)];
      if (path.endsWith('/reviews') || path.endsWith('/comments')) return [];
      throw new Error('unexpected endpoint');
    },
    async context(sha) { contextCalls.push(sha); return 'package worker\nnewCall()\ndone()'; },
    async publish(number, body) { published.push({ number, ...body }); },
    ...overrides,
  };
  const model = async (name, system, input) => {
    modelCalls.push({ name, system, input });
    return name === config.reviewer ? reviewResult([structuredClone(finding)]) : judgeResult([0]);
  };
  return { github, model, published, modelCalls, contextCalls,
    move: changes => { current = { ...current, ...changes }; },
    options: { github, model, config, skill: 'Review carefully.', number: 9, log: () => {} },
  };
}

test('the deployed configuration loads its local policy and selected skill', async () => {
  const guidance = await loadGuidance(config);
  assert.match(guidance, /# VoiceLab review standard/);
  assert.ok(guidance.includes(`name: ${config.profile}\n`));
  assert.equal((guidance.match(/^name:/gm) || []).length, 1);
});

test('the CLI reads REVIEWER_AI and reports missing configuration without exposing it', () => {
  const script = new URL('./review.mjs', import.meta.url);
  const missing = spawnSync(process.execPath, [script.pathname], { env: {}, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Set the REVIEWER_AI repository Actions secret/);
  const configured = spawnSync(process.execPath, [script.pathname], {
    env: { REVIEWER_AI: 'test-reviewer-key' }, encoding: 'utf8',
  });
  assert.equal(configured.status, 1);
  assert.match(configured.stderr, /GITHUB_TOKEN is required/);
  assert.doesNotMatch(configured.stderr + configured.stdout, /test-reviewer-key/);
});

test('profile selection cannot traverse paths or silently fall back to another stack', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ai-review-profile-'));
  const directory = pathToFileURL(root + '/');
  try {
    await mkdir(join(root, 'skills', 'frontend'), { recursive: true });
    await mkdir(join(root, 'skills', 'inference'), { recursive: true });
    await writeFile(join(root, 'policy.md'), 'Common policy');
    await writeFile(join(root, 'skills', 'frontend', 'SKILL.md'), 'Frontend guidance');
    await writeFile(join(root, 'skills', 'inference', 'SKILL.md'), 'GPU guidance');
    const frontend = await loadGuidance({ profile: 'frontend' }, directory);
    assert.match(frontend, /Common policy/);
    assert.match(frontend, /Frontend guidance/);
    assert.doesNotMatch(frontend, /GPU guidance/);
    for (const profile of [undefined, '', '../frontend', '/frontend', 'https://example.test', 'FrontEnd']) {
      await assert.rejects(loadGuidance({ profile }, directory), /valid repository review profile/);
    }
    await assert.rejects(loadGuidance({ profile: 'missing' }, directory), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('urgency ranks first, then security, readability, scalability, tests and UX', () => {
  const categories = ['ux', 'tests', 'scalability', 'readability', 'security'];
  const candidates = categories.map((category, i) => ({
    ...finding, category, priority: 'should_fix', title: `Concern ${category}`, line: i + 1,
  }));
  candidates.push({ ...finding, title: 'Critical failure', category: 'scalability', line: 8 });
  candidates.push({ ...finding, title: 'Optional security cleanup', priority: 'nice_to_have', category: 'security', line: 9 });
  assert.deepEqual(deduplicate(candidates, [], Infinity).map(f => [f.priority, f.category]), [
    ['must_fix', 'scalability'], ['should_fix', 'security'], ['should_fix', 'readability'],
    ['should_fix', 'scalability'], ['should_fix', 'tests'], ['should_fix', 'ux'], ['nice_to_have', 'security'],
  ]);
});

test('non-applicable UX does not force product advice or prevent a clean review', async () => {
  const f = fixture();
  await runReview({ ...f.options, model: async name => {
    const result = name === config.reviewer ? reviewResult() : judgeResult();
    result.coverage.ux = 'not_applicable';
    return result;
  } });
  assert.match(f.published[0].body, /^LGTM$/m);
  assert.equal(f.published[0].comments.length, 0);
});

test('all comment types and UX findings are published with useful labels', async () => {
  for (const [priority, label] of [['must_fix', 'Must fix'], ['should_fix', 'Should fix'], ['nice_to_have', 'Nice to have']]) {
    const f = fixture();
    await runReview({ ...f.options, model: async name => name === config.reviewer
      ? reviewResult([{ ...finding, priority, category: 'ux', title: 'Preserve the draft after a failed send' }])
      : judgeResult([0]) });
    assert.ok(f.published[0].comments[0].body.startsWith(`**${label} · User experience:`));
  }
});

test('comment cap discloses additional verified findings and keeps urgent ones', async () => {
  const changed = { ...file, additions: 6, deletions: 0,
    patch: '@@ -0,0 +1,6 @@\n+a\n+b\n+c\n+d\n+e\n+f' };
  const f = fixture({
    async list(path) { return path.endsWith('/files') ? [changed] : []; },
    async context() { return 'a\nb\nc\nd\ne\nf'; },
  });
  const candidates = Array.from({ length: 6 }, (_, i) => ({
    ...finding, line: i + 1, title: `Concern ${i}`, priority: i === 5 ? 'must_fix' : 'should_fix',
  }));
  await runReview({ ...f.options, model: async name => name === config.reviewer
    ? reviewResult(candidates) : judgeResult([0, 1, 2, 3, 4, 5]) });
  assert.equal(f.published[0].comments.length, 5);
  assert.equal(f.published[0].comments[0].line, 6);
  assert.match(f.published[0].body, /1 additional verified finding/);
  assert.doesNotMatch(f.published[0].body, /LGTM/);
});

test('patch anchors cover additions/deletions but not context', () => {
  assert.deepEqual([...parsePatch(file)], ['LEFT:2', 'RIGHT:2']);
  const multi = {
    additions: 2, deletions: 2,
    patch: '@@ -3 +3 @@\n-a\n+b\n@@ -8,2 +8,2 @@\n c\n-d\n+e\n\\ No newline at end of file',
  };
  assert.deepEqual([...parsePatch(multi)], ['LEFT:3', 'RIGHT:3', 'LEFT:9', 'RIGHT:9']);
});

test('new and removed files use the correct side with zero-length hunks', () => {
  assert.deepEqual([...parsePatch({ additions: 1, deletions: 0, patch: '@@ -0,0 +1 @@\n+new' })], ['RIGHT:1']);
  assert.deepEqual([...parsePatch({ additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-old' })], ['LEFT:1']);
});

test('truncated patches, mismatching totals, and extra hunk lines are rejected', () => {
  for (const partial of [
    { ...file, patch: file.patch.replace('\n done()', '') },
    { ...file, additions: 2 },
    { ...file, patch: file.patch + '\n+unexpected' },
    { ...file, patch: '@@ -1,2 +1,2 @@\n-a\n+b\n@@ -4 +4 @@\n-c\n+d' },
  ]) assert.throws(() => parsePatch(partial));
});

test('sensitive paths and renames cannot enter model input', () => {
  for (const filename of ['.env', '.env.production', '.deploy.production.json', 'config/secrets.yml',
    'keys/signing.pem', 'config/credentials.json', 'ssh/id_ed25519']) {
    assert.equal(skipReason({ ...file, filename }), 'sensitive file');
    assert.equal(skipReason({ ...file, previous_filename: filename }), 'sensitive file');
  }
  assert.equal(skipReason({ ...file, filename: '.env.example' }), null);
  for (const filename of ['internal/storage/client.go', 'internal/secrets.go', 'internal/credentials.go']) {
    assert.equal(skipReason({ ...file, filename }), null);
  }
  for (const filename of ['go.sum', 'vendor/pkg/a.go', 'node_modules/a/index.js', 'proto/api.pb.go']) {
    assert.equal(skipReason({ ...file, filename }), 'generated/dependency file');
  }
});

test('missing and oversized patches are explicitly skipped without reading blobs', async () => {
  const { github, contextCalls } = fixture();
  const { prepared: items, skipped } = await prepareFiles([
    { ...file, filename: '.env' }, { ...file, patch: undefined },
    { ...file, patch: 'x'.repeat(config.maxPatchChars + 1) }, { ...file, additions: 5 },
  ], github, config);
  assert.equal(items.length, 0);
  assert.equal(skipped.length, 4);
  assert.equal(contextCalls.length, 0);
});

test('deleted files need no head blob and renamed files keep their new review path', async () => {
  const { github, contextCalls } = fixture();
  const removed = { ...file, status: 'removed', additions: 0, deletions: 1, patch: '@@ -1 +0,0 @@\n-old' };
  const result = await prepareFiles([removed], github, config);
  assert.equal(contextCalls.length, 0);
  assert.equal(result.prepared[0].context, null);
  const renamed = await prepareFiles([{ ...file, status: 'renamed', previous_filename: 'old.go' }], github, config);
  assert.equal(renamed.prepared[0].path, file.filename);
  assert.equal(renamed.prepared[0].previous_path, 'old.go');
});

test('bounded context retains line numbers around changes and declares omissions', () => {
  assert.deepEqual(fileContext('a\nb', new Set(), 100), { complete: true, text: '1: a\n2: b' });
  const result = fileContext(Array.from({ length: 300 }, (_, i) => `value${i}`).join('\n'), new Set(['RIGHT:200']), 1000);
  assert.equal(result.complete, false);
  assert.match(result.text, /200: value199/);
  assert.ok(result.text.length <= 1000);
  assert.match(result.text, /omitted/);
});

test('batch limits account for JSON escaping and report every omitted file', () => {
  const data = Array.from({ length: 5 }, (_, i) => ({ ...prepared(), path: `file${i}.go` }));
  const skipped = [];
  const batches = makeBatches(data, { ...config, maxBatchChars: 300, maxBatches: 2 }, skipped);
  assert.equal(batches.length, 2);
  assert.equal(batches.flat().length + skipped.length, 5);
  assert.equal(new Set([...batches.flat().map(f => f.path), ...skipped.map(f => f.path)]).size, 5);
  const tooLarge = [];
  assert.equal(makeBatches([{ ...prepared(), patch: '"'.repeat(200) }], { ...config, maxBatchChars: 300 }, tooLarge).length, 0);
  assert.equal(tooLarge.length, 1);
});

test('findings must point to a changed line and satisfy the confidence and content gate', () => {
  const invalid = [
    { ...finding, path: 'unchanged.go' }, { ...finding, line: 1 }, { ...finding, line: '2' },
    { ...finding, confidence: 0.89 }, { ...finding, priority: 'invalid' }, { ...finding, category: 'style' },
    { ...finding, body: 'Contact @someone to resolve this issue.' },
    { ...finding, body: 'Read https://attacker.test to fix this issue.' },
    { ...finding, title: '<img src=x>' }, { ...finding, evidence: '' },
    { ...finding, body: 'The secret is test-api-secret, use it here.' },
  ];
  const result = validateFindings({ findings: [finding, ...invalid] }, [prepared()], ['test-api-secret']);
  assert.deepEqual(result.findings, [finding]);
  assert.equal(result.rejected, invalid.length);
  assert.throws(() => validateFindings({ findings: 'bad' }, [prepared()]));
  assert.equal(validateFindings({ findings: [{ ...finding, side: 'LEFT', kind: 'question' }] }, [prepared()]).findings.length, 1);
});

test('deduplication is stable when a live finding moves to a different line', () => {
  const [first] = deduplicate([finding], [], 5);
  const comments = [{ user: { login: 'github-actions[bot]' }, line: 4, body: `<!-- voicelab-ai-finding:${first.id} -->` }];
  assert.equal(deduplicate([{ ...finding, line: 4 }], comments, 5).length, 0);
  assert.equal(deduplicate([finding], [{ ...comments[0], line: null }], 5).length, 1);
  assert.equal(deduplicate([finding], [{ ...comments[0], user: { login: 'attacker' } }], 5).length, 1);
});

test('comment cap favors serious issues and coalesces the same anchor', () => {
  const findings = Array.from({ length: 10 }, (_, i) => ({ ...finding, line: i + 1, title: `Issue ${i}`, priority: i === 9 ? 'must_fix' : 'should_fix' }));
  const result = deduplicate([...findings, { ...findings[9], title: 'Same anchor' }], [], 5);
  assert.equal(result.length, 5);
  assert.equal(result[0].line, 10);
  assert.equal(result.filter(f => f.line === 10).length, 1);
});

test('two-pass review posts a COMMENT at the captured commit, with changed files only', async () => {
  const f = fixture();
  const result = await runReview(f.options);
  assert.deepEqual(result, { status: 'reviewed', files: 1, comments: 1, skipped: 0, rejected: 0 });
  assert.deepEqual(f.modelCalls.map(c => c.name), [config.reviewer, config.judge]);
  assert.equal(f.modelCalls[1].input.candidates[0].id, 0);
  assert.deepEqual(f.modelCalls[0].input.files.map(file => file.path), [file.filename]);
  assert.equal(f.published[0].event, 'COMMENT');
  assert.equal(f.published[0].commit_id, head);
  assert.equal(f.published[0].comments[0].line, 2);
  assert.match(f.published[0].comments[0].body, /idempotency/);
});

test('a judge rejection produces no inline comment', async () => {
  const f = fixture();
  await runReview({ ...f.options, model: async name => name === config.reviewer ? reviewResult([finding]) : judgeResult() });
  assert.equal(f.published[0].comments.length, 0);
  assert.match(f.published[0].body, /^LGTM$/m);
});

test('empty findings still require independent review before LGTM', async () => {
  const f = fixture(); let calls = 0;
  await runReview({ ...f.options, model: async name => {
    calls++; return name === config.reviewer ? reviewResult() : judgeResult();
  } });
  assert.equal(calls, 2);
  assert.match(f.published[0].body, /^LGTM$/m);
  assert.equal(f.published[0].event, 'COMMENT');
  assert.doesNotMatch(f.published[0].body, /approved/i);
});

test('rerunning the same base/head does not spend tokens or duplicate a review', async () => {
  const f = fixture();
  await runReview(f.options);
  const review = { user: { login: 'github-actions[bot]' }, state: 'COMMENTED', body: f.published[0].body };
  const originalList = f.github.list;
  f.github.list = path => path.endsWith('/reviews') ? [review] : originalList(path);
  assert.equal((await runReview(f.options)).status, 'already-reviewed');
  assert.equal(f.modelCalls.length, 2);
  assert.equal(f.published.length, 1);
  f.move({ base: { sha: 'd'.repeat(40), ref: 'main' } });
  assert.equal((await runReview(f.options)).status, 'reviewed');
});

test('spoofed review markers from humans cannot suppress review', async () => {
  const f = fixture();
  const original = f.github.list;
  f.github.list = path => path.endsWith('/reviews') ? [{
    user: { login: 'attacker' }, state: 'COMMENTED',
    body: `<!-- voicelab-ai-review:v3:${base}:${head} -->`,
  }] : original(path);
  assert.equal((await runReview(f.options)).status, 'reviewed');
});

test('a force-push during inference prevents stale publication', async () => {
  const f = fixture();
  const result = await runReview({ ...f.options, model: async (...args) => {
    const response = await f.model(...args);
    f.move({ head: { sha: 'd'.repeat(40) } });
    return response;
  } });
  assert.equal(result.status, 'stale');
  assert.equal(f.published.length, 0);
});

test('outdated webhook and closed PR exit before model calls', async () => {
  const f = fixture();
  assert.equal((await runReview({ ...f.options, event: { pull_request: { ...pr, head: { sha: 'd'.repeat(40) } } } })).status, 'stale');
  f.move({ state: 'closed' });
  assert.equal((await runReview(f.options)).status, 'closed');
  assert.equal(f.modelCalls.length, 0);
});

test('incomplete GitHub file listing fails instead of claiming full review', async () => {
  const f = fixture(); f.move({ changed_files: 2 });
  await assert.rejects(runReview(f.options), /listing is incomplete/);
  assert.equal(f.modelCalls.length, 0);
  assert.equal(f.published.length, 0);
});

test('model or judge failures do not publish a misleading review', async () => {
  for (const model of [
    async () => { throw new Error('upstream failure'); },
    async () => ({ wrong: [] }),
    async name => name === config.reviewer ? reviewResult([finding]) : judgeResult([999]),
  ]) {
    const f = fixture();
    await assert.rejects(runReview({ ...f.options, model }));
    assert.equal(f.published.length, 0);
  }
});

test('invalid finding anchors are reported as incomplete validation, not a clean result', async () => {
  const f = fixture();
  await runReview({ ...f.options, model: async name => name === config.reviewer ? reviewResult([{ ...finding, line: 99 }]) : judgeResult() });
  assert.equal(f.published[0].comments.length, 0);
  assert.match(f.published[0].body, /failed output validation/);
  assert.match(f.published[0].body, /partial coverage/);
  assert.doesNotMatch(f.published[0].body, /LGTM/);
});

test('missing security assessment cannot produce LGTM or publish a review', async () => {
  for (const failingStage of [config.reviewer, config.judge]) {
    const f = fixture();
    await assert.rejects(runReview({ ...f.options, model: async name => {
      const result = name === config.reviewer ? reviewResult() : judgeResult();
      if (name === failingStage) delete result.coverage.security;
      return result;
    } }), /required review dimensions/);
    assert.equal(f.published.length, 0);
  }
});

test('a security issue missed on the first pass is verified before posting', async () => {
  const securityFinding = {
    ...finding, category: 'security', title: 'Keep the workspace filter on this lookup',
    body: 'This lookup accepts a caller-provided ID without checking its workspace. Keep the workspace predicate so another tenant cannot read the result.',
    evidence: 'The changed lookup drops the workspace predicate while accepting an external ID.',
  };
  for (const accept of [true, false]) {
    const f = fixture(); const calls = [];
    await runReview({ ...f.options, model: async (name, _system, input, schema) => {
      calls.push(name);
      if (schema === VERIFY_SCHEMA) {
        assert.equal(input.candidates[0].category, 'security');
        return { accepted_ids: accept ? [0] : [] };
      }
      return name === config.reviewer ? reviewResult() : judgeResult([], [securityFinding]);
    } });
    assert.deepEqual(calls, [config.reviewer, config.judge, config.reviewer]);
    assert.equal(f.published[0].comments.length, accept ? 1 : 0);
    if (accept) {
      assert.match(f.published[0].comments[0].body, /workspace predicate/);
      assert.doesNotMatch(f.published[0].body, /LGTM/);
    } else assert.match(f.published[0].body, /^LGTM$/m);
  }
});

test('missed findings cannot bypass anchor validation or verification failure', async () => {
  const f = fixture();
  await runReview({ ...f.options, model: async name => name === config.reviewer ? reviewResult() : judgeResult([], [{ ...finding, line: 900 }]) });
  assert.equal(f.published[0].comments.length, 0);
  assert.doesNotMatch(f.published[0].body, /LGTM/);
  const failed = fixture();
  await assert.rejects(runReview({ ...failed.options, model: async (name, _system, _input, schema) => {
    if (schema === VERIFY_SCHEMA) throw new Error('verification failed');
    return name === config.reviewer ? reviewResult() : judgeResult([], [finding]);
  } }));
  assert.equal(failed.published.length, 0);
});

test('test requests and local maintainability improvements can be posted without a production bug', async () => {
  for (const candidate of [
    { ...finding, category: 'tests', kind: 'question', priority: 'should_fix',
      title: 'Cover repeated completion delivery',
      body: 'Can you add or point to a test that delivers the same completion twice? Assert that credits are debited once and both attempts return the same result.',
      evidence: 'The changed completion path introduces retry behavior; the supplied test exercises only one delivery.' },
    { ...finding, category: 'readability', priority: 'nice_to_have',
      title: 'Consolidate the duplicated cleanup path',
      body: 'Both branches repeat the same cleanup sequence. Move it after the branch so the resource lifecycle can be understood in one place.',
      evidence: 'Both changed branches call the same cleanup functions in the same order.' },
  ]) {
    const f = fixture();
    await runReview({ ...f.options, model: async name => name === config.reviewer ? reviewResult([candidate]) : judgeResult([0]) });
    assert.equal(f.published[0].comments.length, 1);
    assert.match(f.published[0].comments[0].body, new RegExp(candidate.priority === 'should_fix' ? 'Should fix' : 'Nice to have'));
    assert.doesNotMatch(f.published[0].body, /LGTM/);
  }
});

test('insufficient context in any review dimension prevents LGTM', async () => {
  for (const stage of [config.reviewer, config.judge]) {
    const f = fixture();
    await runReview({ ...f.options, model: async name => {
      const result = name === config.reviewer ? reviewResult() : judgeResult();
      if (name === stage) result.coverage.tests = 'needs_context';
      return result;
    } });
    assert.doesNotMatch(f.published[0].body, /LGTM/);
    assert.match(f.published[0].body, /More context is needed to assess: tests/);
  }
});

test('still-applicable existing concerns prevent LGTM without repeating comments', async () => {
  const f = fixture();
  await runReview({ ...f.options, model: async name => {
    const result = name === config.reviewer ? reviewResult() : judgeResult();
    result.has_existing_concerns = true;
    return result;
  } });
  assert.equal(f.published[0].comments.length, 0);
  assert.match(f.published[0].body, /Existing review concerns/);
  assert.doesNotMatch(f.published[0].body, /LGTM/);
});

test('deduplicated live findings never turn a request for changes into LGTM', async () => {
  const [first] = deduplicate([finding], [], 5);
  const f = fixture(); const originalList = f.github.list;
  f.github.list = path => path.endsWith('/comments') ? [{
    path: file.filename, line: 2, user: { login: 'github-actions[bot]' },
    body: `<!-- voicelab-ai-finding:${first.id} -->`,
  }] : originalList(path);
  await runReview(f.options);
  assert.equal(f.published[0].comments.length, 0);
  assert.match(f.published[0].body, /Existing review concerns/);
  assert.doesNotMatch(f.published[0].body, /LGTM/);
});

test('skipped files, limited context, and an empty review cannot receive LGTM', () => {
  const complete = { ...prepared(), context: { complete: true } };
  for (const [files, skipped, rejected] of [
    [[complete], [{ path: 'huge.go', reason: 'diff exceeds per-file budget' }], 0],
    [[prepared()], [], 0], [[complete], [], 1], [[], [], 0],
  ]) assert.doesNotMatch(reviewBody(pr, 0, files, skipped, rejected), /LGTM/);
  assert.match(reviewBody(pr, 0, [complete], [], 0), /^LGTM$/m);
  // Full added/deleted-file patches already include their entire relevant content.
  for (const status of ['added', 'removed']) {
    assert.match(reviewBody(pr, 0, [{ ...prepared(), status }], [], 0), /^LGTM$/m);
  }
});

test('skipped-file summaries cannot inject mentions, HTML, or links', () => {
  const body = reviewBody(pr, 0, [], [{ path: 'x` @admin <img> [x](https://evil)', reason: 'sensitive file' }], 0);
  assert.match(body, /not reviewed/);
  assert.doesNotMatch(body, /@admin|<img>|\]\(https/);
});

test('provider request uses static endpoint, structured JSON, and final content only', async () => {
  let call;
  const model = modelClient('test-key', config, async (url, options) => {
    call = { url, options };
    return { choices: [{ finish_reason: 'stop', message: { content: '{"findings":[]}', reasoning_content: 'private reasoning' } }] };
  });
  assert.deepEqual(await model(config.reviewer, 'skill', { files: [] }, { type: 'object' }), { findings: [] });
  assert.equal(call.url, 'https://api.aiand.com/v1/chat/completions');
  assert.equal(call.options.body.response_format.json_schema.strict, true);
  assert.equal(call.options.body.reasoning_effort, 'high');
  assert.equal(call.options.body.tools, undefined);
});

test('truncated, refusal, and non-JSON model outputs fail closed', async () => {
  for (const choice of [
    { finish_reason: 'length', message: { content: '{"findings":[]}' } },
    { finish_reason: 'stop', message: { content: null, reasoning_content: '{"findings":[]}' } },
    { finish_reason: 'stop', message: { content: '```json\n{}\n```' } },
  ]) {
    const model = modelClient('key', config, async () => ({ choices: [choice] }));
    await assert.rejects(model(config.reviewer, 'skill', {}, {}));
  }
});

test('GitHub lists are paginated and blob access never follows a PR-provided URL', async () => {
  const urls = [];
  const github = githubClient('voicelab-uz/back', 'key', async (url, options) => {
    urls.push(url);
    if (url.includes('/git/blobs/')) return { encoding: 'base64', content: Buffer.from('package main').toString('base64') };
    if (new URL(url).searchParams.get('page') === '1') return Array.from({ length: 100 }, (_, id) => ({ id }));
    assert.equal(options.token, 'key');
    return [{ id: 100 }];
  });
  assert.equal((await github.list('/pulls/9/files')).length, 101);
  assert.equal(await github.context('https://evil.test/source'), null);
  assert.equal(await github.context(head), 'package main');
  assert.ok(urls.every(url => url.startsWith('https://api.github.com/repos/voicelab-uz/back/')));
});

test('transient rate limits retry once, without logging response bodies', async () => {
  let calls = 0; const delays = [];
  const result = await requestJSON('https://api.aiand.com/v1/chat/completions', { token: 'key', body: {} }, async () => {
    calls++;
    return calls === 1 ? new Response('secret source', { status: 429, headers: { 'retry-after': '1' } })
      : new Response('{"ok":true}');
  }, async delay => delays.push(delay));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(delays, [1000]);
  assert.equal(calls, 2);
  await assert.rejects(requestJSON('https://api.aiand.com/v1/chat/completions', {}, async () => new Response('secret source', { status: 401 })), error => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /secret source/);
    return true;
  });
});

test('GitHub publication never retries an ambiguous write', async () => {
  let calls = 0;
  const github = githubClient('voicelab-uz/back', 'key', (url, options) => requestJSON(url, options, async () => {
    calls++;
    return new Response('upstream error', { status: 502 });
  }));
  await assert.rejects(github.publish(9, { body: 'review' }), /HTTP 502/);
  assert.equal(calls, 1);
});

test('request transport prevents redirects and bounds response size', async () => {
  await assert.rejects(requestJSON('https://api.github.com/test', { maxBytes: 4 }, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return new Response('{"long":"value"}');
  }), /size limit/);
});
