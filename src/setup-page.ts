import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Exact VoiceLab wordmark from the website's public logo asset.
const logo = readFileSync(new URL('../assets/voicelab-logo.svg', import.meta.url), 'utf8').trim();

const styles = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f8f7f4;
  color: #191919;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.page { max-width: 900px; margin: 0 auto; padding: 34px 28px 72px; }
.logo { display: inline-block; }
.logo svg { display: block; width: 158px; height: auto; }
main { padding-top: 70px; }
h1 { margin: 0; font-size: clamp(38px, 5vw, 56px); line-height: 1.08; letter-spacing: -.055em; font-weight: 650; }
.intro { max-width: 640px; margin: 16px 0 0; color: #666; font-size: 18px; line-height: 1.55; }
.url-box { margin: 36px 0 30px; padding: 22px 24px; background: #fff; border: 1px solid #e4e1dc; border-radius: 18px; }
.label { display: block; margin-bottom: 10px; color: #74706a; font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.url-box code { font-size: clamp(15px, 2vw, 20px); font-weight: 650; overflow-wrap: anywhere; }
.url-box small { display: block; margin-top: 9px; color: #777; font-size: 13px; }
.options { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.option { display: flex; flex-direction: column; align-items: flex-start; min-height: 225px; padding: 26px; background: #fff; border: 1px solid #e4e1dc; border-radius: 18px; }
.option h2 { margin: 0 0 10px; font-size: 24px; letter-spacing: -.04em; }
.option p { margin: 0 0 18px; color: #62605d; line-height: 1.55; }
.option .note { margin-top: 0; font-size: 13px; }
.button { display: inline-block; margin-top: auto; padding: 13px 20px; border-radius: 999px; background: #191919; color: #fff; font-size: 14px; font-weight: 650; text-decoration: none; }
.button:hover { background: #333; }
.more { margin-top: 27px; color: #666; font-size: 14px; line-height: 1.6; }
.more a, footer a { text-underline-offset: 3px; }
footer { display: flex; gap: 18px; margin-top: 54px; padding-top: 22px; border-top: 1px solid #e4e1dc; color: #666; font-size: 13px; }
:focus-visible { outline: 3px solid #3881b7; outline-offset: 3px; }
@media (max-width: 650px) {
  .page { padding: 24px 18px 48px; }
  .logo svg { width: 145px; }
  main { padding-top: 54px; }
  .intro { font-size: 16px; }
  .url-box { margin: 28px 0 18px; padding: 20px; }
  .options { grid-template-columns: 1fr; }
  .option { min-height: 0; padding: 23px; }
  .button { margin-top: 6px; }
  footer { margin-top: 40px; }
}
`;

const styleHash = createHash('sha256').update(styles).digest('base64');
export const MCP_SETUP_CSP = `default-src 'none'; style-src 'sha256-${styleHash}'; frame-ancestors 'none'; base-uri 'none'`;

export const MCP_SETUP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect VoiceLab MCP</title>
  <style>${styles}</style>
</head>
<body>
  <div class="page">
    <header><a class="logo" href="https://voicelab.uz/" aria-label="VoiceLab home">${logo}</a></header>
    <main>
      <h1>Connect VoiceLab MCP</h1>
      <p class="intro">Use VoiceLab in ChatGPT, Claude, or another MCP client.</p>

      <div class="url-box">
        <span class="label">MCP server URL</span>
        <code>https://mcp.voicelab.uz/mcp</code>
        <small>Remote · Streamable HTTP · OAuth</small>
      </div>

      <div class="options">
        <section class="option" aria-labelledby="chatgpt-title">
          <h2 id="chatgpt-title">ChatGPT</h2>
          <p>Open the VoiceLab plugin and sign in.</p>
          <a class="button" href="https://chatgpt.com/plugins/plugin_asdk_app_6abe4899cbb081918c17cf28290df7b8">Open in ChatGPT ↗</a>
        </section>
        <section class="option" aria-labelledby="claude-title">
          <h2 id="claude-title">Claude</h2>
          <p>Go to Connectors → Add custom connector. Enter the URL above and sign in.</p>
          <p class="note">Team or Enterprise: an owner adds the connector first.</p>
          <a class="button" href="https://claude.ai/">Open Claude ↗</a>
        </section>
      </div>

      <p class="more">For other MCP clients, add the URL as a remote Streamable HTTP server. <a href="https://docs.voicelab.uz/mcp/clients">Setup guide</a> · <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude instructions</a></p>
    </main>
    <footer><a href="https://voicelab.uz/">VoiceLab</a><a href="https://docs.voicelab.uz/mcp/quickstart">MCP documentation</a></footer>
  </div>
</body>
</html>`;
