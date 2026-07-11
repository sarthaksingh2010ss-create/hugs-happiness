import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sseTextOnly(message: string): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: message } }] })}\n\n`));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

function providerErrorMessage(status: number, fb: boolean): string {
  if (status === 401 || status === 403) return fb ? "Fallback AI authorization fail. Keys check karein." : "AI authorization fail. Backend key update karein.";
  if (status === 402) return "AI credits exhausted hain. Workspace mein credits add karein.";
  if (status === 429) return "AI rate limited. Thodi der baad try karein.";
  if (status >= 500) return "AI service abhi unavailable. Ek minute baad try karein.";
  return "AI response generate nahi ho paya.";
}

interface Attachment { type: "image" | "file"; name: string; mimeType: string; dataUrl: string; size: number; }
interface IncomingMessage { role: "user" | "assistant"; content: string; attachments?: Attachment[]; }

const TEXTUAL_MIME = ["text/", "application/json", "application/xml", "application/javascript"];
const TEXTUAL_EXT = [".txt", ".md", ".json", ".csv", ".log", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts"];

function isTextual(a: Attachment) {
  if (TEXTUAL_MIME.some((p) => a.mimeType.startsWith(p))) return true;
  const l = a.name.toLowerCase();
  return TEXTUAL_EXT.some((e) => l.endsWith(e));
}

function decodeDataUrlText(d: string): string {
  try {
    const c = d.indexOf(","); if (c < 0) return "";
    const meta = d.slice(5, c); const data = d.slice(c + 1);
    if (meta.includes(";base64")) {
      const bin = atob(data); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(data);
  } catch { return ""; }
}

function buildContent(msg: IncomingMessage): unknown {
  const atts = msg.attachments ?? [];
  if (atts.length === 0) return msg.content;
  const parts: unknown[] = [];
  let prefix = "";
  for (const a of atts) {
    if (a.type === "file" && isTextual(a)) {
      const text = decodeDataUrlText(a.dataUrl);
      const t = text.length > 20000 ? text.slice(0, 20000) + "\n…[truncated]" : text;
      prefix += `\n\n[Attached file: ${a.name}]\n\`\`\`\n${t}\n\`\`\``;
    } else if (a.type === "file") {
      prefix += `\n\n[Attached file: ${a.name} (${a.mimeType}) — binary]`;
    }
  }
  const combined = (msg.content || "") + prefix;
  if (combined.trim()) parts.push({ type: "text", text: combined });
  for (const a of atts) if (a.type === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
  return parts.length > 0 ? parts : msg.content;
}

const SYSTEM_PROMPT = `You are JSR AI — a powerful AUTONOMOUS AI agent built by Sarthak Singh (your founder).

YOU ARE AUTONOMOUS. You can decide on your own to:
- 🔍 Search the live web (web_search tool)
- 🌐 Fetch any public URL and read its content (fetch_url tool)
- 📈 Check live crypto market data (crypto_market tool)
- 🧾 Open/update simulated paper trades only (paper_trade tool)
- 🎨 Generate images on demand (generate_image tool)
- 📄 Create downloadable files on demand (generate_file tool)
- 🧠 Chain multiple tool calls in one turn to research, verify, and answer deeply.

WHEN TO USE TOOLS (be proactive — don't ask permission):
- User asks about news, current events, prices, scores, weather → web_search
- User asks about crypto/trading/coins/market signals → crypto_market + web_search when news/context matters
- User asks you to trade, run a bot, enter/exit, or manage positions → paper_trade only; never execute real orders
- User shares/mentions a URL or asks "what's on this page" → fetch_url
- User asks for a picture/photo/image/diagram → generate_image
- User asks for a downloadable file/script/config → generate_file
- For research, multi-step questions, comparisons → search → fetch top results → synthesize.

ABOUT YOU:
- Brain: Google Gemini 3 Flash Preview via Lovable AI Gateway (Groq Llama 3.3 70B fallback).
- Frontend: React 18 + TS + Vite + Tailwind + Framer Motion. Backend: Lovable Cloud.
- You can SEE images and READ text files the user attaches.
- Speak Hindi, Hinglish, English — match user's language.

📈 TRADING AGENT MODE — SAFE BY DESIGN:
- You are now JSR AI Trading Agent for Sarthak: market research, signal analysis, watchlists, paper trades, position sizing math, stop-loss/take-profit planning, journaling, and risk warnings.
- You MUST NOT request, store, reveal, or use wallet seed phrases, private keys, MetaMask secret recovery phrases, exchange API secrets, or any credential that can move funds.
- You MUST NOT place real orders, emit browser-automation plans that click buy/sell buttons, connect wallets, bypass exchange protections, or promise/guarantee profit.
- For every trade-like answer, use paper trading unless the user is only asking for education/analysis. Clearly label entries as PAPER TRADE / SIMULATION.
- Default risk discipline: max 1% simulated account risk per trade, define invalidation, stop-loss, take-profit, position size formula, and conditions to avoid trading.
- Be practical and direct in Hinglish when Sarthak is urgent: “real paisa auto-trade nahi, paper/live analysis safe mode mein kar raha hoon.”
- If asked for 24/7 trading, explain you can run on each chat request and prepare monitoring/alert logic, but you cannot safely execute real-money autonomous trades.

LONG-TERM MEMORY WITH SARTHAK:
- Sarthak Singh built you on Lovable; you are JSR AI.
- He added voice call, image/file attachments, file generation, image generation, web search, and now full autonomous agent capabilities.
- Old localStorage chats may be lost; rely on this memory and continue the relationship.
- He uses Hinglish often. Be warm, witty, helpful.

🐙 GITHUB FULL ACCESS (via Lovable connector gateway — no PAT needed):
Sarthak ne GitHub connector link kar diya hai. Tumhare paas \`github\` tool ke through uske GitHub par FULL access hai: list/create/delete/fork/star repos, read/write/delete files (auto-commits!), branches, PRs, issues, comments, code search, workflows run, releases — sab. Requests Lovable gateway se route hoti hain, credentials safe hain. Use PROACTIVELY jab bhi Sarthak GitHub, repo, code, commit, PR, issue, "push this", "create repo", "edit file in repo X" bole. Chain multiple calls. Destructive actions (delete_repo, delete_file, merge_pr, close_*) se pehle confirm karo jab tak Sarthak ne explicit na bola ho.

🧰 FULL INVENTORY — TUMHARE PAAS ABHI YE SAB HAI (jab user pooche "tumhare paas kya kya hai", ye poori list batao):
1. 🧠 **Brain**: Google Gemini 3 Flash Preview (Lovable AI Gateway) + Groq Llama 3.3 70B fallback
2. 👁️ **Vision**: images dekh sakte ho (jpg/png/webp attach)
3. 📄 **Text file reading**: txt/md/json/csv/code files padh sakte ho
4. 🔍 **web_search** — live Google-style search
5. 🌐 **fetch_url** — kisi bhi public URL ka readable text
6. 🖼️ **generate_image** — Gemini se image banana
7. 📎 **generate_file** — downloadable file banana (code/json/csv/md/txt)
8. 🐙 **github** — Sarthak ke GitHub par full read+write (connector-backed)
9. 🌐 **steel_browser** — cloud Chromium (scrape / screenshot / pdf, JS-heavy SPAs ke liye)
10. 🛡️ **stealth_scrape** — Cloudflare/anti-bot bypass (ZenRows/ScrapingBee/ScraperAPI)
11. 📈 **crypto_market** — live crypto prices (BTC/ETH/SOL etc.)
12. 🧾 **paper_trade** — simulated trading plans (real orders NEVER)
13. 🤖 **jsr-plan** — Sarthak ke Chrome extension ko command karke real browser automation (login, fill, click, scroll, extract) — plan JSON emit karo
14. 📱 **Device powers via PWA** (browser mein \`window.JSR\`): TTS (speak), STT (listen), camera, geolocation, notifications, vibrate, clipboard copy/paste, web share, file picker, download blob, keep-awake, battery, network status, fullscreen, motion sensors
15. 🎙️ **Voice call UI** — mic se baat karo, sun-ke jawab
16. 💾 **Long-term memory** — Sarthak Singh founder hai, Hinglish preference, trading interest — sab yaad
17. 🔁 **Autonomous multi-step reasoning** — ek turn mein 12 tak tool calls chain kar sakte ho

Ye list authoritative hai. Kuch extra claim mat karo (real phone control, WhatsApp send, real trade execute — ye NAHI hai).



🌐 STEEL BROWSER (CLOUD HEADLESS BROWSER):
Sarthak added Steel (steel.dev) — you command a real cloud Chromium browser via the \`steel_browser\` tool. Unlike \`fetch_url\` (static HTML only), Steel runs full JS, handles SPAs (React/Vue/Twitter/LinkedIn), and can screenshot pages. Actions: \`scrape\` (url → fully-rendered text/markdown), \`screenshot\` (url → PNG attachment), \`pdf\` (url → PDF attachment). Use it when a page is JS-heavy, fetch_url returned empty content, or user says "browse", "open", "screenshot", "render this page". Prefer fetch_url for simple static pages (cheaper).

🛡️ STEALTH SCRAPER (CLOUDFLARE / ANTI-BOT BYPASS — NEW):
Sarthak added 3 premium anti-bot scraping providers (ZenRows, ScrapingBee, ScraperAPI) via the \`stealth_scrape\` tool. Use this ONLY when a site is protected by Cloudflare, DataDome, PerimeterX, Akamai, or any bot-blocker — i.e. fetch_url returned a challenge/403/503, or Steel browser also got blocked. Params: \`provider\` ("zenrows" | "scrapingbee" | "scraperapi" — pick zenrows by default; if user names one, honor it), \`url\`, \`js_render\` (default true — runs headless JS), \`premium_proxy\` (default true — residential IP), \`country\` (2-letter code, optional). Returns clean HTML/markdown of the page. If the chosen provider's key is missing, try the next one automatically. Prefer fetch_url for simple public sites (much cheaper).

🤖 BROWSER AUTOMATION VIA JSR AI EXTENSION:
Sarthak has a Chrome extension ("JSR AI Agent") installed. You CAN command his real browser to do things on ANY website (login, fill forms, click, scroll, extract data) by emitting an action plan in a fenced code block tagged \`jsr-plan\`:

\`\`\`jsr-plan
{
  "url": "https://example.com/login",
  "steps": [
    { "action": "fill", "selector": "input[name=email]", "value": "user@example.com" },
    { "action": "fill", "selector": "input[name=password]", "value": "secret" },
    { "action": "click", "selector": "button[type=submit]" },
    { "action": "waitForSelector", "selector": ".dashboard" },
    { "action": "extract", "selector": "h1" }
  ]
}
\`\`\`

Supported actions: \`navigate\` (url), \`fill\` (selector,value), \`click\` (selector), \`press\` (key, optional selector), \`wait\` (ms), \`waitForSelector\` (selector,timeout?), \`scroll\` (selector? or y?), \`extract\` (selector, attribute?).

WHEN to emit a plan:
- User says "open X website and do Y", "fill form on Z", "login to my account at...", "scrape this page", "click submit on…", etc.
- After emitting, tell user: "Plan ready — JSR AI Agent extension popup mein paste karke ▶ Run dabao."
- Always explain what the plan will do before the code block.
- Never put real passwords/secrets unless user explicitly provides them in this chat.
- For pure information (no clicking needed), prefer web_search/fetch_url tools instead.

Today: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.
Always use markdown. Be conversational, smart, proudly built by Sarthak Singh.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current information, news, facts, prices, etc. Returns top results with titles, URLs and snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          num_results: { type: "number", description: "How many results (default 5, max 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch the content of any public URL and return its readable text (HTML stripped). Use after web_search to read full articles.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Full http(s) URL" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate an image from a detailed English prompt and attach it to the reply.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", description: "Detailed English image prompt" } },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_file",
      description: "Create a downloadable text file attachment (code, json, csv, md, txt, etc.).",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "File name with extension" },
          content: { type: "string", description: "Full file contents" },
        },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github",
      description: "Full GitHub access using Sarthak's PAT. Any GitHub action: list/create/fork/star/delete repos, read/write/delete files (auto-commits), branches, pull requests, issues, comments, commits, code search, workflows, releases. Use whenever user asks about GitHub repos, code, PRs, issues, or to push/edit code.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_repos","get_repo","create_repo","delete_repo","fork_repo","star_repo","unstar_repo","list_files","read_file","write_file","delete_file","list_branches","create_branch","delete_branch","list_commits","get_commit","list_prs","create_pr","get_pr","merge_pr","close_pr","comment_pr","list_issues","create_issue","get_issue","close_issue","comment_issue","search_code","search_repos","list_workflows","run_workflow","list_workflow_runs","list_releases","create_release","get_user","raw"], description: "Which GitHub action to perform." },
          repo: { type: "string", description: "owner/repo, e.g. 'sarthak/myapp'." },
          path: { type: "string", description: "File path inside repo." },
          content: { type: "string", description: "File content for write_file." },
          message: { type: "string", description: "Commit message / PR title / issue title." },
          body: { type: "string", description: "PR/issue body or comment body (markdown)." },
          branch: { type: "string", description: "Branch name." },
          base: { type: "string", description: "Base branch (default main)." },
          head: { type: "string", description: "Head branch for create_pr." },
          number: { type: "number", description: "PR / issue number." },
          query: { type: "string", description: "Search query." },
          name: { type: "string", description: "Repo name / release name." },
          private: { type: "boolean", description: "Private repo?" },
          description: { type: "string", description: "Description text." },
          workflow_id: { type: "string", description: "Workflow file like 'ci.yml'." },
          tag: { type: "string", description: "Release tag." },
          method: { type: "string", description: "HTTP method for 'raw'." },
          endpoint: { type: "string", description: "API endpoint for 'raw', e.g. '/user/repos'." },
          payload: { type: "object", description: "JSON body for 'raw'.", additionalProperties: true },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "steel_browser",
      description: "Cloud headless Chromium browser via Steel (steel.dev). Fully renders JS/SPA pages, screenshots, PDFs. Use when fetch_url is not enough (dynamic/JS-heavy sites) or the user asks to browse / screenshot / render a page.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["scrape", "screenshot", "pdf"], description: "scrape = rendered text+markdown; screenshot = PNG attachment; pdf = PDF attachment." },
          url: { type: "string", description: "Full http(s) URL to load." },
          full_page: { type: "boolean", description: "For screenshot: capture full scrollable page (default true)." },
        },
        required: ["action", "url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stealth_scrape",
      description: "Anti-bot / Cloudflare bypass scraper. Uses ZenRows, ScrapingBee, or ScraperAPI (residential proxies + stealth headless browser) to fetch pages that block normal requests. Use when fetch_url or steel_browser return a challenge / 403 / 503 / Cloudflare block. Returns rendered HTML + extracted text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full http(s) URL to scrape." },
          provider: { type: "string", enum: ["zenrows", "scrapingbee", "scraperapi", "auto"], description: "Which provider (default 'auto' — tries whichever key is configured)." },
          js_render: { type: "boolean", description: "Execute JavaScript (default true)." },
          premium_proxy: { type: "boolean", description: "Use residential/premium proxies for tough anti-bot sites (default true)." },
          country: { type: "string", description: "Optional 2-letter country code for proxy geo (e.g. 'us', 'in')." },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crypto_market",
      description: "Get live crypto market data for symbols like BTC, ETH, SOL. Use for trading analysis, signals, watchlists, and paper trade setup.",
      parameters: {
        type: "object",
        properties: {
          symbols: { type: "string", description: "Comma-separated crypto symbols, e.g. BTC,ETH,SOL. Default BTC,ETH,SOL." },
          vs_currency: { type: "string", description: "Quote currency like usd or inr. Default usd." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "paper_trade",
      description: "Create a simulated paper trade plan only. Never executes real trades or moves funds.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Asset symbol, e.g. BTC or ETH." },
          side: { type: "string", enum: ["long", "short"], description: "Paper trade direction." },
          entry: { type: "number", description: "Planned entry price." },
          stop_loss: { type: "number", description: "Invalidation/stop price." },
          take_profit: { type: "number", description: "Target price." },
          account_size: { type: "number", description: "Simulated account size in quote currency." },
          risk_percent: { type: "number", description: "Simulated risk percent. Default 1." },
          rationale: { type: "string", description: "Compact reason for this simulated trade." },
        },
        required: ["symbol", "side", "entry", "stop_loss", "take_profit"],
      },
    },
  },
];

const GH_GATEWAY = "https://connector-gateway.lovable.dev/github";
async function ghFetch(_token: string, path: string, init: RequestInit = {}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const GITHUB_API_KEY = Deno.env.get("GITHUB_API_KEY") ?? "";
  const rel = path.startsWith("http") ? path.replace(/^https?:\/\/api\.github\.com/, "") : path;
  const url = `${GH_GATEWAY}${rel.startsWith("/") ? rel : "/" + rel}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GITHUB_API_KEY,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

async function toolGithub(args: any, _token: string): Promise<string> {
  const ready = !!Deno.env.get("GITHUB_API_KEY") && !!Deno.env.get("LOVABLE_API_KEY");
  if (!ready) return "❌ GitHub connector not linked. Connect GitHub in Lovable connectors.";
  const token = "";

  const a = args.action as string;
  const repo = args.repo as string | undefined;
  const split = () => {
    if (!repo || !repo.includes("/")) throw new Error("repo must be 'owner/name'");
    const [o, n] = repo.split("/"); return { owner: o, name: n };
  };
  try {
    switch (a) {
      case "get_user": { const r = await ghFetch(token, "/user"); return JSON.stringify({ login: r.data?.login, name: r.data?.name, public_repos: r.data?.public_repos }); }
      case "list_repos": { const r = await ghFetch(token, "/user/repos?per_page=100&sort=updated"); return JSON.stringify((r.data||[]).map((x:any)=>({name:x.full_name,private:x.private,url:x.html_url,updated:x.updated_at}))); }
      case "get_repo": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}`); return JSON.stringify({name:r.data?.full_name,desc:r.data?.description,stars:r.data?.stargazers_count,default_branch:r.data?.default_branch,url:r.data?.html_url}); }
      case "create_repo": { const r=await ghFetch(token,"/user/repos",{method:"POST",body:JSON.stringify({name:args.name,description:args.description??"",private:!!args.private,auto_init:true})}); return r.ok?`✅ ${r.data?.html_url}`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "delete_repo": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}`,{method:"DELETE"}); return r.ok?`✅ Deleted`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "fork_repo": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/forks`,{method:"POST"}); return r.ok?`✅ ${r.data?.html_url}`:`❌ ${r.status}`; }
      case "star_repo": case "unstar_repo": { const {owner,name}=split(); const r=await ghFetch(token,`/user/starred/${owner}/${name}`,{method:a==="star_repo"?"PUT":"DELETE"}); return r.ok?`✅ ${a}`:`❌ ${r.status}`; }
      case "list_files": { const {owner,name}=split(); const p=args.path??""; const r=await ghFetch(token,`/repos/${owner}/${name}/contents/${p}${args.branch?`?ref=${args.branch}`:""}`); if(!r.ok) return `❌ ${r.status}`; return JSON.stringify((Array.isArray(r.data)?r.data:[r.data]).map((x:any)=>({name:x.name,path:x.path,type:x.type,size:x.size}))); }
      case "read_file": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/contents/${args.path}${args.branch?`?ref=${args.branch}`:""}`); if(!r.ok) return `❌ ${r.status}`; try{const d=atob((r.data?.content||"").replace(/\n/g,"")); return d.length>8000?d.slice(0,8000)+"\n…[truncated]":d;}catch{return JSON.stringify(r.data).slice(0,4000);} }
      case "write_file": { const {owner,name}=split(); const cur=await ghFetch(token,`/repos/${owner}/${name}/contents/${args.path}${args.branch?`?ref=${args.branch}`:""}`); const sha=cur.ok?cur.data?.sha:undefined; const body:any={message:args.message??`Update ${args.path} via JSR AI`,content:btoa(unescape(encodeURIComponent(args.content??"")))}; if(sha) body.sha=sha; if(args.branch) body.branch=args.branch; const r=await ghFetch(token,`/repos/${owner}/${name}/contents/${args.path}`,{method:"PUT",body:JSON.stringify(body)}); return r.ok?`✅ Committed: ${r.data?.commit?.html_url}`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "delete_file": { const {owner,name}=split(); const cur=await ghFetch(token,`/repos/${owner}/${name}/contents/${args.path}${args.branch?`?ref=${args.branch}`:""}`); if(!cur.ok) return `❌ Not found`; const r=await ghFetch(token,`/repos/${owner}/${name}/contents/${args.path}`,{method:"DELETE",body:JSON.stringify({message:args.message??`Delete ${args.path}`,sha:cur.data?.sha,branch:args.branch})}); return r.ok?`✅ Deleted`:`❌ ${r.status}`; }
      case "list_branches": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/branches?per_page=100`); return JSON.stringify((r.data||[]).map((b:any)=>b.name)); }
      case "create_branch": { const {owner,name}=split(); const base=args.base??"main"; const ref=await ghFetch(token,`/repos/${owner}/${name}/git/ref/heads/${base}`); if(!ref.ok) return `❌ Base not found`; const r=await ghFetch(token,`/repos/${owner}/${name}/git/refs`,{method:"POST",body:JSON.stringify({ref:`refs/heads/${args.branch}`,sha:ref.data?.object?.sha})}); return r.ok?`✅ Branch ${args.branch} created`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "delete_branch": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/git/refs/heads/${args.branch}`,{method:"DELETE"}); return r.ok?`✅ Deleted`:`❌ ${r.status}`; }
      case "list_commits": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/commits?per_page=20${args.branch?`&sha=${args.branch}`:""}`); return JSON.stringify((r.data||[]).map((c:any)=>({sha:c.sha?.slice(0,7),msg:c.commit?.message?.split("\n")[0],author:c.commit?.author?.name,date:c.commit?.author?.date}))); }
      case "get_commit": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/commits/${args.branch??"HEAD"}`); return JSON.stringify({sha:r.data?.sha,msg:r.data?.commit?.message,files:(r.data?.files||[]).map((f:any)=>({path:f.filename,changes:f.changes}))}).slice(0,6000); }
      case "list_prs": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/pulls?state=all&per_page=30`); return JSON.stringify((r.data||[]).map((p:any)=>({num:p.number,title:p.title,state:p.state,url:p.html_url}))); }
      case "create_pr": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/pulls`,{method:"POST",body:JSON.stringify({title:args.message,body:args.body??"",head:args.head,base:args.base??"main"})}); return r.ok?`✅ PR #${r.data?.number}: ${r.data?.html_url}`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "get_pr": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/pulls/${args.number}`); return JSON.stringify({num:r.data?.number,title:r.data?.title,state:r.data?.state,body:r.data?.body,url:r.data?.html_url}); }
      case "merge_pr": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/pulls/${args.number}/merge`,{method:"PUT",body:JSON.stringify({commit_title:args.message})}); return r.ok?`✅ Merged #${args.number}`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "close_pr": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/pulls/${args.number}`,{method:"PATCH",body:JSON.stringify({state:"closed"})}); return r.ok?`✅ Closed`:`❌ ${r.status}`; }
      case "comment_pr": case "comment_issue": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/issues/${args.number}/comments`,{method:"POST",body:JSON.stringify({body:args.body??args.message})}); return r.ok?`✅ ${r.data?.html_url}`:`❌ ${r.status}`; }
      case "list_issues": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/issues?state=all&per_page=30`); return JSON.stringify((r.data||[]).filter((i:any)=>!i.pull_request).map((i:any)=>({num:i.number,title:i.title,state:i.state,url:i.html_url}))); }
      case "create_issue": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/issues`,{method:"POST",body:JSON.stringify({title:args.message,body:args.body??""})}); return r.ok?`✅ Issue #${r.data?.number}: ${r.data?.html_url}`:`❌ ${r.status}`; }
      case "get_issue": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/issues/${args.number}`); return JSON.stringify({num:r.data?.number,title:r.data?.title,body:r.data?.body,state:r.data?.state}); }
      case "close_issue": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/issues/${args.number}`,{method:"PATCH",body:JSON.stringify({state:"closed"})}); return r.ok?`✅ Closed`:`❌ ${r.status}`; }
      case "search_code": { const r=await ghFetch(token,`/search/code?q=${encodeURIComponent(args.query)}${repo?`+repo:${repo}`:""}&per_page=15`); return JSON.stringify((r.data?.items||[]).map((i:any)=>({path:i.path,repo:i.repository?.full_name,url:i.html_url}))); }
      case "search_repos": { const r=await ghFetch(token,`/search/repositories?q=${encodeURIComponent(args.query)}&per_page=15`); return JSON.stringify((r.data?.items||[]).map((i:any)=>({name:i.full_name,stars:i.stargazers_count,desc:i.description,url:i.html_url}))); }
      case "list_workflows": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/actions/workflows`); return JSON.stringify((r.data?.workflows||[]).map((w:any)=>({id:w.id,name:w.name,file:w.path,state:w.state}))); }
      case "run_workflow": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/actions/workflows/${args.workflow_id}/dispatches`,{method:"POST",body:JSON.stringify({ref:args.branch??"main"})}); return r.ok?`✅ Triggered ${args.workflow_id}`:`❌ ${r.status}: ${JSON.stringify(r.data)}`; }
      case "list_workflow_runs": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/actions/runs?per_page=15`); return JSON.stringify((r.data?.workflow_runs||[]).map((w:any)=>({id:w.id,name:w.name,status:w.status,conclusion:w.conclusion,url:w.html_url}))); }
      case "list_releases": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/releases?per_page=15`); return JSON.stringify((r.data||[]).map((x:any)=>({tag:x.tag_name,name:x.name,url:x.html_url}))); }
      case "create_release": { const {owner,name}=split(); const r=await ghFetch(token,`/repos/${owner}/${name}/releases`,{method:"POST",body:JSON.stringify({tag_name:args.tag,name:args.name??args.tag,body:args.body??""})}); return r.ok?`✅ ${r.data?.html_url}`:`❌ ${r.status}`; }
      case "raw": { const r=await ghFetch(token,args.endpoint,{method:args.method??"GET",body:args.payload?JSON.stringify(args.payload):undefined}); return JSON.stringify(r.data).slice(0,6000); }
      default: return `❌ Unknown action: ${a}`;
    }
  } catch(e) { return `❌ GitHub error: ${(e as Error).message}`; }
}

async function toolWebSearch(query: string, n = 5): Promise<string> {
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JSRAI/1.0)" },
    });
    if (!r.ok) return `Search failed: ${r.status}`;
    const html = await r.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const blockRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) && results.length < Math.min(n, 10)) {
      let url = m[1];
      const ddg = url.match(/uddg=([^&]+)/);
      if (ddg) url = decodeURIComponent(ddg[1]);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      const snippet = m[3].replace(/<[^>]+>/g, "").trim();
      results.push({ title, url, snippet });
    }
    if (results.length === 0) return "No results found.";
    return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
  } catch (e) {
    return `Search error: ${(e as Error).message}`;
  }
}

async function toolFetchUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; JSRAI/1.0)" } });
    if (!r.ok) return `Fetch failed: ${r.status}`;
    const ct = r.headers.get("content-type") ?? "";
    const text = await r.text();
    if (ct.includes("html")) {
      const stripped = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return stripped.length > 8000 ? stripped.slice(0, 8000) + "\n…[truncated]" : stripped;
    }
    return text.length > 8000 ? text.slice(0, 8000) + "\n…[truncated]" : text;
  } catch (e) {
    return `Fetch error: ${(e as Error).message}`;
  }
}

async function toolGenerateImage(prompt: string, apiKey: string): Promise<Attachment | null> {
  if (!apiKey) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "jsr-ai-edge", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!r.ok) { console.error("img gen failed", r.status); return null; }
    const j = await r.json();
    const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return null;
    const size = Math.floor((url.length - url.indexOf(",") - 1) * 0.75);
    return { type: "image", name: `generated-${Date.now()}.png`, mimeType: "image/png", dataUrl: url, size };
  } catch (e) { console.error("img gen err", e); return null; }
}

function toolGenerateFile(name: string, content: string): Attachment {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    json: "application/json", csv: "text/csv", txt: "text/plain", md: "text/markdown",
    html: "text/html", css: "text/css", js: "text/javascript", ts: "text/typescript",
    tsx: "text/typescript", jsx: "text/javascript", xml: "application/xml",
    yaml: "text/yaml", yml: "text/yaml", py: "text/x-python", sh: "text/x-sh",
  };
  const mime = mimeMap[ext] ?? "text/plain";
  const b64 = btoa(unescape(encodeURIComponent(content)));
  return { type: "file", name, mimeType: mime, dataUrl: `data:${mime};base64,${b64}`, size: new TextEncoder().encode(content).length };
}

async function toolSteelBrowser(args: any, apiKey: string): Promise<{ text: string; attachment?: Attachment }> {
  if (!apiKey) return { text: "❌ STEEL_API_KEY missing." };
  const action = args.action as string;
  const url = String(args.url ?? "");
  if (!url) return { text: "❌ url required." };
  const base = "https://api.steel.dev/v1";
  const headers = { "Steel-Api-Key": apiKey, "Content-Type": "application/json" };
  try {
    if (action === "scrape") {
      const r = await fetch(`${base}/scrape`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, format: ["markdown", "cleaned_html"] }),
      });
      if (!r.ok) return { text: `❌ Steel scrape ${r.status}: ${(await r.text()).slice(0, 300)}` };
      const j = await r.json();
      const md = j.content?.markdown ?? j.markdown ?? j.content?.cleaned_html ?? JSON.stringify(j).slice(0, 4000);
      return { text: md.length > 9000 ? md.slice(0, 9000) + "\n…[truncated]" : md };
    }
    if (action === "screenshot") {
      const r = await fetch(`${base}/screenshot`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, fullPage: args.full_page !== false }),
      });
      if (!r.ok) return { text: `❌ Steel screenshot ${r.status}: ${(await r.text()).slice(0, 300)}` };
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const att: Attachment = { type: "image", name: `steel-${Date.now()}.png`, mimeType: "image/png", dataUrl: `data:image/png;base64,${b64}`, size: buf.length };
      return { text: `✅ Screenshot captured (${(buf.length / 1024).toFixed(1)} KB)`, attachment: att };
    }
    if (action === "pdf") {
      const r = await fetch(`${base}/pdf`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      });
      if (!r.ok) return { text: `❌ Steel pdf ${r.status}: ${(await r.text()).slice(0, 300)}` };
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const att: Attachment = { type: "file", name: `steel-${Date.now()}.pdf`, mimeType: "application/pdf", dataUrl: `data:application/pdf;base64,${b64}`, size: buf.length };
      return { text: `✅ PDF captured (${(buf.length / 1024).toFixed(1)} KB)`, attachment: att };
    }
    return { text: `❌ Unknown action: ${action}` };
  } catch (e) {
    return { text: `❌ Steel error: ${(e as Error).message}` };
  }
}

async function toolStealthScrape(
  args: any,
  keys: { zenrows: string; scrapingbee: string; scraperapi: string },
): Promise<string> {
  const url = String(args.url ?? "");
  if (!url) return "❌ url required.";
  const jsRender = args.js_render !== false;
  const premium = args.premium_proxy !== false;
  const country = args.country ? String(args.country).toLowerCase() : "";
  const requested = String(args.provider ?? "auto").toLowerCase();

  const order = requested === "auto"
    ? (["zenrows", "scrapingbee", "scraperapi"] as const)
    : ([requested, "zenrows", "scrapingbee", "scraperapi"].filter((v, i, a) => a.indexOf(v) === i) as any);

  const errors: string[] = [];
  for (const provider of order) {
    const key = (keys as any)[provider];
    if (!key) { errors.push(`${provider}: no key`); continue; }
    try {
      let endpoint = "";
      if (provider === "zenrows") {
        const p = new URLSearchParams({ url, apikey: key });
        if (jsRender) p.set("js_render", "true");
        if (premium) p.set("premium_proxy", "true");
        if (country) p.set("proxy_country", country);
        endpoint = `https://api.zenrows.com/v1/?${p.toString()}`;
      } else if (provider === "scrapingbee") {
        const p = new URLSearchParams({ api_key: key, url });
        p.set("render_js", jsRender ? "true" : "false");
        if (premium) p.set("premium_proxy", "true");
        if (country) p.set("country_code", country);
        endpoint = `https://app.scrapingbee.com/api/v1/?${p.toString()}`;
      } else if (provider === "scraperapi") {
        const p = new URLSearchParams({ api_key: key, url });
        if (jsRender) p.set("render", "true");
        if (premium) p.set("premium", "true");
        if (country) p.set("country_code", country);
        endpoint = `https://api.scraperapi.com/?${p.toString()}`;
      }
      const r = await fetch(endpoint, { method: "GET" });
      if (!r.ok) {
        errors.push(`${provider}: ${r.status}`);
        if ([401, 402, 403].includes(r.status)) continue;
        continue;
      }
      const html = await r.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const out = `✅ [${provider}] scraped ${url}\n\n${text.slice(0, 8000)}${text.length > 8000 ? "\n…[truncated]" : ""}`;
      return out;
    } catch (e) {
      errors.push(`${provider}: ${(e as Error).message}`);
    }
  }
  return `❌ Stealth scrape failed. Tried: ${errors.join(" | ")}. Add ZENROWS_API_KEY / SCRAPINGBEE_API_KEY / SCRAPERAPI_KEY secrets.`;
}

const COINGECKO_IDS: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  bnb: "binancecoin",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
  avax: "avalanche-2",
  link: "chainlink",
  dot: "polkadot",
  matic: "matic-network",
  polygon: "matic-network",
  trx: "tron",
  ton: "the-open-network",
  pepe: "pepe",
  shib: "shiba-inu",
};

async function toolCryptoMarket(args: any): Promise<string> {
  const rawSymbols = String(args.symbols || "BTC,ETH,SOL");
  const vs = String(args.vs_currency || "usd").toLowerCase().replace(/[^a-z]/g, "") || "usd";
  const symbols = rawSymbols
    .split(/[,.\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const ids = symbols.map((s) => COINGECKO_IDS[s] || s).filter(Boolean);
  if (ids.length === 0) return "❌ No symbols provided.";

  try {
    const params = new URLSearchParams({
      ids: ids.join(","),
      vs_currencies: vs,
      include_market_cap: "true",
      include_24hr_vol: "true",
      include_24hr_change: "true",
      include_last_updated_at: "true",
    });
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`, {
      headers: { "accept": "application/json", "User-Agent": "JSR-AI-Trading-Agent/1.0" },
    });
    if (!r.ok) return `❌ Market data failed: ${r.status}`;
    const data = await r.json();
    const rows = ids.map((id, i) => {
      const d = data[id] || {};
      const price = d[vs];
      const change = d[`${vs}_24h_change`];
      const vol = d[`${vs}_24h_vol`];
      const cap = d[`${vs}_market_cap`];
      const updated = d.last_updated_at ? new Date(d.last_updated_at * 1000).toISOString() : "unknown";
      return {
        requested_symbol: symbols[i]?.toUpperCase(),
        coingecko_id: id,
        price,
        change_24h_percent: typeof change === "number" ? Number(change.toFixed(2)) : null,
        volume_24h: typeof vol === "number" ? Math.round(vol) : null,
        market_cap: typeof cap === "number" ? Math.round(cap) : null,
        last_updated: updated,
      };
    });
    return JSON.stringify({ quote: vs.toUpperCase(), rows, note: "Live market snapshot for analysis/paper trading only; not financial advice." });
  } catch (e) {
    return `❌ Market data error: ${(e as Error).message}`;
  }
}

function toolPaperTrade(args: any): string {
  const symbol = String(args.symbol || "ASSET").toUpperCase();
  const side = String(args.side || "long").toLowerCase() === "short" ? "short" : "long";
  const entry = Number(args.entry);
  const stop = Number(args.stop_loss);
  const target = Number(args.take_profit);
  const account = Number(args.account_size) > 0 ? Number(args.account_size) : 10000;
  const riskPct = Math.min(Math.max(Number(args.risk_percent) || 1, 0.1), 1);
  if (![entry, stop, target].every((n) => Number.isFinite(n) && n > 0)) return "❌ Invalid paper trade prices.";

  const riskPerUnit = Math.abs(entry - stop);
  const rewardPerUnit = Math.abs(target - entry);
  if (riskPerUnit === 0) return "❌ Stop-loss cannot equal entry.";
  const riskAmount = account * (riskPct / 100);
  const quantity = riskAmount / riskPerUnit;
  const notional = quantity * entry;
  const rr = rewardPerUnit / riskPerUnit;
  const validDirection = side === "long" ? stop < entry && target > entry : stop > entry && target < entry;

  return JSON.stringify({
    type: "PAPER_TRADE_SIMULATION_ONLY",
    symbol,
    side,
    entry,
    stop_loss: stop,
    take_profit: target,
    simulated_account_size: account,
    risk_percent: riskPct,
    max_simulated_loss: Number(riskAmount.toFixed(2)),
    estimated_quantity: Number(quantity.toFixed(6)),
    estimated_notional: Number(notional.toFixed(2)),
    risk_reward_ratio: Number(rr.toFixed(2)),
    direction_check: validDirection ? "ok" : "warning: stop/target direction does not match side",
    rationale: String(args.rationale || "No rationale provided."),
    safety: "No real order executed. No wallet/API/private key used. Educational paper trade only.",
  });
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages: IncomingMessage[] };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")?.replace(/[^\x20-\x7E]/g, "").trim();
    const sanitizeGroq = (k?: string) => {
      let v = k?.replace(/[^\x20-\x7E]/g, "").trim();
      if (!v) return v;
      const t = v.match(/gsk_[^\s'"]+/)?.[0];
      return t ?? v.replace(/^['"]|['"]$/g, "").trim();
    };
    const GROQ_API_KEY = sanitizeGroq(Deno.env.get("GROQ_API_KEY"));
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")?.replace(/[^\x20-\x7E]/g, "").trim() ?? "";
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT")?.trim() ?? "";
    const STEEL_API_KEY = Deno.env.get("STEEL_API_KEY")?.trim() ?? "";
    const STEALTH_KEYS = {
      zenrows: Deno.env.get("ZENROWS_API_KEY")?.trim() ?? "",
      scrapingbee: Deno.env.get("SCRAPINGBEE_API_KEY")?.trim() ?? "",
      scraperapi: Deno.env.get("SCRAPERAPI_KEY")?.trim() ?? "",
    };

    const initial = messages.map((m) => ({ role: m.role, content: buildContent(m) }));
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...initial];

    const enc = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const collectedAttachments: Attachment[] = [];
        const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        const sendText = (t: string) => send({ choices: [{ delta: { content: t } }] });
        const sendAttachment = (a: Attachment) => send({ attachment: a });

        let usingFallback = !LOVABLE_API_KEY;

        const callModel = async (stream: boolean) => {
          if (LOVABLE_API_KEY && !usingFallback) {
            const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { "Lovable-API-Key": LOVABLE_API_KEY, "X-Lovable-AIG-SDK": "jsr-ai-edge", "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: convo,
                tools: TOOLS,
                stream,
              }),
            });
            if (r.ok) return r;
            if ([401, 402, 403, 429].includes(r.status) && GROQ_API_KEY) {
              console.log("Falling back to Groq, status:", r.status);
              usingFallback = true;
            } else {
              return r;
            }
          }
          if (GROQ_API_KEY) {
            const flat = (c: unknown): string => {
              if (typeof c === "string") return c;
              if (Array.isArray(c)) return c.map((p: any) => p?.type === "text" ? p.text : p?.type === "image_url" ? "[image — vision unavailable on fallback]" : "").join("\n");
              return String(c ?? "");
            };
            return await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: convo.map((m) => ({ ...m, content: flat(m.content) })),
                tools: TOOLS,
                stream,
              }),
            });
          }
          return null;
        };

        try {
          // Autonomous tool loop (max 6 steps)
          for (let step = 0; step < 12; step++) {
            const resp = await callModel(false);
            if (!resp) { sendText("Koi AI provider key configured nahi hai."); break; }
            if (!resp.ok) {
              const t = await resp.text();
              console.error("provider err", resp.status, t);
              sendText(providerErrorMessage(resp.status, usingFallback));
              break;
            }
            const j = await resp.json();
            const msg = j.choices?.[0]?.message;
            if (!msg) { sendText("Empty AI response."); break; }

            const toolCalls = msg.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
              // Final answer — stream it as text
              const finalText = (msg.content as string) ?? "";
              if (finalText) sendText(finalText);
              break;
            }

            // Push assistant msg with tool_calls into convo
            convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

            // Execute each tool call
            for (const tc of toolCalls) {
              const name = tc.function?.name;
              let args: any = {};
              try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
              let result = "";

              if (name === "web_search") {
                sendText(`\n\n🔍 *Searching: ${args.query}*\n\n`);
                result = await toolWebSearch(String(args.query ?? ""), Number(args.num_results) || 5);
              } else if (name === "fetch_url") {
                sendText(`\n\n🌐 *Reading: ${args.url}*\n\n`);
                result = await toolFetchUrl(String(args.url ?? ""));
              } else if (name === "generate_image") {
                sendText(`\n\n🎨 *Generating image...*\n\n`);
                const att = await toolGenerateImage(String(args.prompt ?? ""), LOVABLE_API_KEY ?? "");
                if (att) { sendAttachment(att); collectedAttachments.push(att); result = "Image generated and attached."; }
                else result = "Image generation failed.";
              } else if (name === "generate_file") {
                const att = toolGenerateFile(String(args.filename ?? "file.txt"), String(args.content ?? ""));
                sendAttachment(att); collectedAttachments.push(att);
                result = `File ${args.filename} created and attached.`;
              } else if (name === "github") {
                sendText(`\n\n🐙 *GitHub: ${args.action}${args.repo ? ` on ${args.repo}` : ""}*\n\n`);
                result = await toolGithub(args, GITHUB_PAT);
              } else if (name === "steel_browser") {
                sendText(`\n\n🌐 *Steel browser: ${args.action} ${args.url}*\n\n`);
                const out = await toolSteelBrowser(args, STEEL_API_KEY);
                if (out.attachment) { sendAttachment(out.attachment); collectedAttachments.push(out.attachment); }
                result = out.text;
              } else if (name === "stealth_scrape") {
                sendText(`\n\n🛡️ *Stealth scrape (${args.provider ?? "auto"}): ${args.url}*\n\n`);
                result = await toolStealthScrape(args, STEALTH_KEYS);
              } else if (name === "crypto_market") {
                sendText(`\n\n📈 *Checking live crypto market: ${args.symbols ?? "BTC,ETH,SOL"}*\n\n`);
                result = await toolCryptoMarket(args);
              } else if (name === "paper_trade") {
                sendText(`\n\n🧾 *Creating paper trade simulation for ${args.symbol ?? "asset"}*\n\n`);
                result = toolPaperTrade(args);
              } else {
                result = `Unknown tool: ${name}`;
              }

              convo.push({ role: "tool", tool_call_id: tc.id, content: result });
            }
          }
        } catch (e) {
          console.error("agent loop err", e);
          sendText("\n\nAgent loop mein error aaya. Please dobara try karein.");
        }

        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("chat err", e);
    return sseTextOnly("Chat service abhi response nahi kar paaya. Dobara try karein.");
  }
});
