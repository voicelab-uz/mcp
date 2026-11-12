import { createHash } from 'node:crypto';

// Static content: no request data, scripts, external assets, or credentials enter this page.
const styles = `:root{color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f7f6f2;color:#181818;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit}.shell{max-width:1220px;margin:0 auto;padding:18px 28px 64px}.site-header{min-height:66px;padding:10px 14px 10px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:#fff;border:1px solid #eceae6;border-radius:999px;box-shadow:0 8px 28px rgba(34,30,25,.06)}.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-size:22px;font-weight:750;letter-spacing:-.055em;white-space:nowrap}.brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#181818;color:#fff;font-size:13px;letter-spacing:-.08em}.nav{display:flex;align-items:center;gap:24px;font-size:14px}.nav a{text-decoration:none}.nav a:hover,.text-link:hover{text-decoration:underline}.nav .open-app{padding:13px 22px;border-radius:999px;background:#181818;color:#fff}.hero{display:grid;grid-template-columns:1.06fr .94fr;gap:36px;align-items:stretch;margin:88px 0 78px}.hero-copy{padding:18px 0 8px}.eyebrow{display:flex;align-items:center;gap:9px;margin:0 0 25px;font-size:12px;font-weight:760;letter-spacing:.13em;text-transform:uppercase}.eyebrow-dot{width:9px;height:9px;border-radius:50%;background:#e98c59;box-shadow:0 0 0 5px #f8e6db}h1{max-width:650px;margin:0;font-size:clamp(48px,5.55vw,82px);line-height:1.015;letter-spacing:-.075em;font-weight:610}.lede{max-width:565px;margin:26px 0 30px;color:#64625e;font-size:18px;line-height:1.65}.hero-actions{display:flex;flex-wrap:wrap;gap:10px}.button{min-height:50px;padding:0 22px;display:inline-flex;align-items:center;justify-content:center;gap:15px;border-radius:999px;font-size:14px;font-weight:650;text-decoration:none;transition:transform .18s ease,box-shadow .18s ease}.button:hover{transform:translateY(-2px)}.button-dark{background:#181818;color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.12)}.button-light{background:#fff;border:1px solid #dedbd5}.hero-art{position:relative;display:flex;flex-direction:column;min-height:420px;padding:27px;border-radius:32px;overflow:hidden;background:radial-gradient(circle at 18% 22%,rgba(255,222,185,.9),transparent 40%),radial-gradient(circle at 76% 72%,rgba(159,199,230,.8),transparent 42%),linear-gradient(128deg,#edb69c 0%,#df8f70 43%,#bdcfe0 100%);box-shadow:0 14px 40px rgba(86,67,56,.1)}.hero-art:before{content:"";position:absolute;inset:-40% -35% auto auto;width:450px;height:450px;border:1px solid rgba(255,255,255,.35);border-radius:50%}.art-top{position:relative;display:flex;justify-content:space-between;gap:12px;color:#34312e;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.ready{display:flex;align-items:center;gap:7px;letter-spacing:0;text-transform:none;font-weight:600}.ready:before{content:"";width:7px;height:7px;border-radius:50%;background:#2d7b54}.art-flow{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:auto 0 20px;padding:20px 22px;border:1px solid rgba(255,255,255,.72);border-radius:20px;background:rgba(255,255,255,.76);backdrop-filter:blur(14px);font-size:20px;font-weight:660;letter-spacing:-.045em}.flow-arrow{font-size:25px;font-weight:400;color:#837e79}.endpoint{position:relative;padding:20px 22px 22px;border:1px solid rgba(255,255,255,.78);border-radius:20px;background:#fff;box-shadow:0 15px 28px rgba(50,41,37,.08)}.endpoint-label{display:block;margin-bottom:10px;color:#797571;font-size:11px;font-weight:750;letter-spacing:.13em;text-transform:uppercase}.endpoint code{display:block;overflow-wrap:anywhere;font-size:17px;font-weight:650;letter-spacing:-.03em}.endpoint-meta{display:block;margin-top:10px;color:#77736f;font-size:12px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:24px}.section-head h2{margin:0;font-size:clamp(29px,3vw,40px);line-height:1.12;letter-spacing:-.06em;font-weight:620}.section-head p{max-width:400px;margin:0;color:#77736f;line-height:1.55}.platforms{display:grid;grid-template-columns:1fr 1fr;gap:18px}.platform{min-height:365px;display:flex;flex-direction:column;padding:30px;border:1px solid #e8e5df;border-radius:26px;background:#fff;box-shadow:0 8px 25px rgba(30,24,20,.035)}.platform-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:38px}.platform-number{color:#aaa49c;font-size:13px}.platform-badge{padding:8px 12px;border-radius:999px;background:#f5f4f1;font-size:12px;font-weight:700}.platform h3{max-width:470px;margin:0 0 12px;font-size:31px;line-height:1.15;letter-spacing:-.055em;font-weight:620}.platform p{max-width:480px;margin:0;color:#66625e;line-height:1.62}.platform-steps{margin:16px 0 0;padding-left:21px;color:#55514d;line-height:1.6}.platform-links{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin-top:auto;padding-top:28px}.platform-links .button{min-height:45px}.text-link{font-size:13px;text-underline-offset:3px}.other{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:20px;padding:26px 30px;border:1px solid #e8e5df;border-radius:24px;background:#efeeea}.other h3{margin:0 0 7px;font-size:19px;letter-spacing:-.04em}.other p{margin:0;color:#66625e;line-height:1.5}.other a{white-space:nowrap}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:56px;padding-top:22px;border-top:1px solid #e6e2dc;color:#77736f;font-size:13px}.footer a{text-underline-offset:3px}:focus-visible{outline:3px solid #3881b7;outline-offset:3px}@media(max-width:900px){.hero{grid-template-columns:1fr;margin:62px 0}.hero-art{min-height:350px}.platforms{grid-template-columns:1fr}.platform{min-height:315px}.section-head{align-items:start;flex-direction:column}}@media(max-width:620px){.shell{padding:12px 16px 40px}.site-header{min-height:58px;padding:8px 9px 8px 15px}.brand{font-size:18px}.brand-mark{width:27px;height:27px}.nav{gap:10px;font-size:12px}.nav .docs-link{display:none}.nav .open-app{padding:11px 15px}.hero{gap:28px;margin:48px 0 58px}.hero-copy{padding:0}.eyebrow{margin-bottom:20px}h1{font-size:clamp(43px,11vw,63px)}.lede{font-size:16px;margin:20px 0 24px}.hero-actions .button{width:100%}.hero-art{min-height:330px;padding:20px;border-radius:26px}.art-flow{font-size:17px}.endpoint{padding:18px}.endpoint code{font-size:14px}.platform{padding:24px;min-height:0}.platform-top{margin-bottom:25px}.platform h3{font-size:27px}.platform-links{padding-top:24px}.other{align-items:start;flex-direction:column;padding:24px}.footer{flex-direction:column;margin-top:38px}}`;

const styleHash = createHash('sha256').update(styles).digest('base64');
export const MCP_SETUP_CSP = `default-src 'none'; style-src 'sha256-${styleHash}'; frame-ancestors 'none'; base-uri 'none'`;

export const MCP_SETUP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f7f6f2">
  <meta name="description" content="Connect VoiceLab MCP to ChatGPT, Claude, or any remote MCP client.">
  <title>Connect VoiceLab MCP</title>
  <style>${styles}</style>
</head>
<body>
  <div class="shell">
    <header class="site-header">
      <a class="brand" href="https://voicelab.uz/" aria-label="VoiceLab home"><span class="brand-mark" aria-hidden="true">VL</span>VoiceLab</a>
      <nav class="nav" aria-label="Main navigation">
        <a class="docs-link" href="https://docs.voicelab.uz/mcp/quickstart">Documentation</a>
        <a class="open-app" href="https://voicelab.uz/app">Open app ↗</a>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span> VoiceLab MCP server</p>
          <h1 id="hero-title">Your voice tools, inside your AI assistant.</h1>
          <p class="lede">Generate speech, transcribe recordings, and clean up audio with VoiceLab tools in ChatGPT, Claude, and other MCP clients.</p>
          <div class="hero-actions">
            <a class="button button-dark" href="https://chatgpt.com/plugins/plugin_asdk_app_6abe4899cbb081918c17cf28290df7b8">Open in ChatGPT <span aria-hidden="true">↗</span></a>
            <a class="button button-light" href="#claude">Set up Claude <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div class="hero-art" aria-label="VoiceLab remote MCP connection">
          <div class="art-top"><span>VoiceLab / MCP</span><span class="ready">Ready to connect</span></div>
          <div class="art-flow"><span>VoiceLab</span><span class="flow-arrow" aria-hidden="true">→</span><span>Your assistant</span></div>
          <div class="endpoint"><span class="endpoint-label">Server URL</span><code>https://mcp.voicelab.uz/mcp</code><span class="endpoint-meta">Streamable HTTP · OAuth 2.1</span></div>
        </div>
      </section>

      <section aria-labelledby="platform-title">
        <div class="section-head"><h2 id="platform-title">Choose where to connect.</h2><p>Use the VoiceLab plugin in ChatGPT, or add the remote MCP URL in another client.</p></div>
        <div class="platforms">
          <article class="platform">
            <div class="platform-top"><span class="platform-badge">ChatGPT</span><span class="platform-number">01 / 02</span></div>
            <h3>Start with the VoiceLab plugin.</h3>
            <p>Open the VoiceLab plugin page in ChatGPT, add it to your account, and complete VoiceLab sign-in when prompted.</p>
            <div class="platform-links"><a class="button button-dark" href="https://chatgpt.com/plugins/plugin_asdk_app_6abe4899cbb081918c17cf28290df7b8">Open VoiceLab in ChatGPT ↗</a><a class="text-link" href="https://docs.voicelab.uz/mcp/clients">Connection guide</a></div>
          </article>
          <article class="platform" id="claude">
            <div class="platform-top"><span class="platform-badge">Claude</span><span class="platform-number">02 / 02</span></div>
            <h3>Add a custom connector by URL.</h3>
            <p>In Claude, open Connectors under Customize or Plugins, then choose Add custom connector. Name it VoiceLab and enter the server URL above. Follow the OAuth sign-in flow.</p>
            <p class="platform-steps">For Team or Enterprise, an organization owner adds the Web connector first; members then connect individually.</p>
            <div class="platform-links"><a class="button button-dark" href="https://claude.ai/">Open Claude ↗</a><a class="text-link" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">Claude setup guide</a></div>
          </article>
        </div>
        <div class="other"><div><h3>Using another MCP client?</h3><p>Add the same server URL as a remote Streamable HTTP connector and sign in with VoiceLab. Try asking for the <code>list_voices</code> tool after connecting.</p></div><a class="text-link" href="https://docs.voicelab.uz/mcp/quickstart">Read the quickstart ↗</a></div>
      </section>
    </main>
    <footer class="footer"><span>VoiceLab MCP · Secure connection via OAuth</span><span><a href="https://docs.voicelab.uz/mcp/clients">Client setup</a> · <a href="https://docs.voicelab.uz/mcp/security">Security</a></span></footer>
  </div>
</body>
</html>`;
