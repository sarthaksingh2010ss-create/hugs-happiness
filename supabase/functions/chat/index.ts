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
];

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
          for (let step = 0; step < 6; step++) {
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
