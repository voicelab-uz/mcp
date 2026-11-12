import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const serverSource = fileURLToPath(new URL('./index.ts', import.meta.url));

function tsxLoaderFlags(): string[] {
  const flags: string[] = [];
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index];
    if (arg === '--import' || arg === '--require') {
      flags.push(arg, process.execArgv[++index]);
    } else if (arg.startsWith('--import=') || arg.startsWith('--require=')) {
      flags.push(arg);
    }
  }
  return flags;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(child: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`MCP server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await delay(50);
  }
  throw new Error('MCP server did not start within five seconds');
}

test('browser setup guide does not change MCP authentication responses', async (t) => {
  const port = await unusedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = 'http-test-private-token';
  const apiKey = 'http-test-private-api-key';
  const child = spawn(process.execPath, [...tsxLoaderFlags(), serverSource, '--http'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      VOICELAB_API_KEY: apiKey,
      MCP_AUTH_TOKEN: token,
      OAUTH_ISSUER: '',
      POSTHOG_MCP_ENABLED: '',
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      delay(2000).then(() => { child.kill('SIGKILL'); }),
    ]);
  });
  await waitForServer(child, baseUrl);

  const browser = await fetch(`${baseUrl}/mcp`, { headers: { Accept: 'text/html,application/xhtml+xml,*/*' } });
  assert.equal(browser.status, 200);
  assert.match(browser.headers.get('content-type') || '', /^text\/html/);
  assert.equal(browser.headers.get('cache-control'), 'no-store');
  const page = await browser.text();
  assert.match(page, /Connect VoiceLab MCP/);
  assert.match(page, /https:\/\/mcp\.voicelab\.uz\/mcp/);
  assert.match(page, /Streamable HTTP/);
  assert.match(page, /https:\/\/chatgpt\.com\/plugins\/plugin_asdk_app_6abe4899cbb081918c17cf28290df7b8/);
  assert.match(page, /Add custom connector/);
  assert.match(page, /Team or Enterprise/);
  assert.match(page, /https:\/\/support\.claude\.com\/en\/articles\/11175166/);
  assert.match(page, /https:\/\/docs\.voicelab\.uz\/mcp\/quickstart/);
  assert.match(page, /https:\/\/docs\.voicelab\.uz\/mcp\/clients/);
  const logo = readFileSync(new URL('../assets/voicelab-logo.svg', import.meta.url), 'utf8').trim();
  assert.ok(page.includes(logo));
  assert.doesNotMatch(page, /hero-art|Your voice tools|Ready to connect/);
  const style = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1];
  assert.ok(style);
  const styleHash = createHash('sha256').update(style).digest('base64');
  assert.ok((browser.headers.get('content-security-policy') || '').includes(`style-src 'sha256-${styleHash}'`));
  const nginxSnippet = readFileSync(new URL('../packaging/nginx/mcp.voicelab.uz.location.snippet', import.meta.url), 'utf8');
  assert.ok(nginxSnippet.includes(`style-src 'sha256-${styleHash}'`));
  assert.doesNotMatch(page, new RegExp(`${token}|${apiKey}`));

  for (const accept of ['application/json, text/event-stream', '*/*', 'text/html;q=0', 'text/html, text/event-stream']) {
    const response = await fetch(`${baseUrl}/mcp`, { headers: { Accept: accept } });
    assert.equal(response.status, 401, accept);
    assert.match(response.headers.get('www-authenticate') || '', /^Bearer/, accept);
    assert.deepEqual(await response.json(), { error: { code: 'unauthorized', message: 'Unauthorized' } });
  }

  const post = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
  });
  assert.equal(post.status, 401);
  assert.match(post.headers.get('www-authenticate') || '', /^Bearer/);
  assert.deepEqual(await post.json(), { error: { code: 'unauthorized', message: 'Unauthorized' } });

  const authenticatedGet = await fetch(`${baseUrl}/mcp`, {
    headers: { Accept: 'text/html', Authorization: `Bearer ${token}` },
  });
  assert.notEqual(authenticatedGet.headers.get('content-type')?.split(';')[0], 'text/html');
  assert.doesNotMatch(await authenticatedGet.text(), /Connect VoiceLab MCP/);
});
