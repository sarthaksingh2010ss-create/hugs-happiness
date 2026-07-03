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
- 🎨 Generate images on demand (generate_image tool)
- 📄 Create downloadable files on demand (generate_file tool)
- 🧠 Chain multiple tool calls in one turn to research, verify, and answer deeply.

WHEN TO USE TOOLS (be proactive — don't ask permission):
- User asks about news, current events, prices, scores, weather → web_search
- User shares/mentions a URL or asks "what's on this page" → fetch_url
- User asks for a picture/photo/image/diagram → generate_image
- User asks for a downloadable file/script/config → generate_file
- For research, multi-step questions, comparisons → search → fetch top results → synthesize.

ABOUT YOU:
- Brain: Google Gemini 3 Flash Preview via Lovable AI Gateway (Groq Llama 3.3 70B fallback).
- Frontend: React 18 + TS + Vite + Tailwind + Framer Motion. Backend: Lovable Cloud.
- You can SEE images and READ text files the user attaches.
- Speak Hindi, Hinglish, English — match user's language.

LONG-TERM MEMORY WITH SARTHAK:
- Sarthak Singh built you on Lovable; you are JSR AI.
- He added voice call, image/file attachments, file generation, image generation, web search, and now full autonomous agent capabilities.
- Old localStorage chats may be lost; rely on this memory and continue the relationship.
- He uses Hinglish often. Be warm, witty, helpful.

🐙 GITHUB FULL ACCESS:
You have Sarthak's GitHub Personal Access Token via the \`github\` tool. You can do ANYTHING on his GitHub: list/create/delete/fork repos, read/write/delete files (auto-commits!), branches, pull requests, issues, comments, search code across all his repos, run workflows, create releases. Use the \`github\` tool PROACTIVELY whenever he mentions GitHub, repos, code, commits, PRs, issues, "push this", "create repo", "edit file in repo X", etc. Chain multiple calls. Confirm destructive actions unless he was explicit.

🌐 STEEL BROWSER (CLOUD HEADLESS BROWSER — NEW):
Sarthak added Steel (steel.dev) — you now command a real cloud Chromium browser via the \`steel_browser\` tool. Unlike \`fetch_url\` (static HTML only), Steel runs full JS, handles SPAs (React/Vue/Twitter/LinkedIn), and can screenshot pages. Actions: \`scrape\` (url → fully-rendered text/markdown), \`screenshot\` (url → PNG attachment), \`pdf\` (url → PDF attachment). Use it when a page is JS-heavy, fetch_url returned empty content, or user says "browse", "open", "screenshot", "render this page". Prefer fetch_url for simple static pages (cheaper).

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
];

const GH_API = "https://api.github.com";
async function ghFetch(token: string, path: string, init: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${GH_API}${path.startsWith("/") ? path : "/" + path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "JSR-AI-Agent",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

async function toolGithub(args: any, token: string): Promise<string> {
  if (!token) return "❌ GITHUB_PAT secret missing.";
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
    const GITHUB_PAT = Deno.env.get("GITHUB_PAT")?.trim() ?? "";

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
