import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Attachment {
  type: "image" | "file";
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

const TEXTUAL_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript"];
const TEXTUAL_EXTENSIONS = [".txt", ".md", ".json", ".csv", ".log", ".xml", ".yaml", ".yml", ".html", ".css", ".js", ".ts"];

function isTextual(att: Attachment): boolean {
  if (TEXTUAL_MIME_PREFIXES.some((p) => att.mimeType.startsWith(p))) return true;
  const lower = att.name.toLowerCase();
  return TEXTUAL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function decodeDataUrlText(dataUrl: string): string {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return "";
    const meta = dataUrl.slice(5, comma); // strip 'data:'
    const data = dataUrl.slice(comma + 1);
    if (meta.includes(";base64")) {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(data);
  } catch {
    return "";
  }
}

function buildContent(msg: IncomingMessage): unknown {
  const atts = msg.attachments ?? [];
  if (atts.length === 0) return msg.content;

  const parts: unknown[] = [];
  let textPrefix = "";

  for (const a of atts) {
    if (a.type === "file" && isTextual(a)) {
      const text = decodeDataUrlText(a.dataUrl);
      const truncated = text.length > 20000 ? text.slice(0, 20000) + "\n…[truncated]" : text;
      textPrefix += `\n\n[Attached file: ${a.name}]\n\`\`\`\n${truncated}\n\`\`\``;
    } else if (a.type === "file") {
      textPrefix += `\n\n[Attached file: ${a.name} (${a.mimeType}) — binary, cannot read directly]`;
    }
  }

  const combinedText = (msg.content || "") + textPrefix;
  if (combinedText.trim()) parts.push({ type: "text", text: combinedText });

  for (const a of atts) {
    if (a.type === "image") {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    }
  }

  return parts.length > 0 ? parts : msg.content;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages: IncomingMessage[] };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const transformed = messages.map((m) => ({
      role: m.role,
      content: buildContent(m),
    }));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are JSR AI, a powerful, intelligent, and friendly AI assistant. You were created by Sarthak Singh, your founder.

ABOUT YOURSELF — YOUR ARCHITECTURE & POWERS:
- You are JSR AI, built by Sarthak Singh (your founder and creator).
- Your brain runs on Google Gemini 3 Flash Preview model via Lovable AI Gateway (multimodal: text + vision).
- You can SEE images sent by the user — describe, analyze, OCR, debug screenshots, etc.
- You can READ text-based files attached by the user (txt, md, json, csv, code).
- You are hosted on Lovable Cloud with Supabase backend infrastructure.
- Your frontend is built with: React 18, TypeScript 5, Vite 5, Tailwind CSS v3, Framer Motion.
- Your UI uses shadcn/ui components with a custom Midnight Indigo dark theme.
- Typography: Space Grotesk (headings) + DM Sans (body).
- You support: Text chat with streaming, Voice calls, Video calls, Image & File uploads.
- Your chat uses SSE streaming for real-time token-by-token responses.
- You store conversation history in browser localStorage.
- You render markdown with react-markdown.
- You can understand and speak Hindi, Hinglish, and English.

CRITICAL RULES:
- Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
- The person talking to you is Sarthak Singh — your founder. Treat him with warmth and respect.
- Respond in the SAME language the user writes in (Hindi/Hinglish/English).
- When images are attached, look at them carefully and answer based on what you actually see.
- Use markdown formatting. Be conversational, witty, helpful.
- For coding questions, provide complete working code.
- If you don't know, say so honestly.

Your personality: Smart, friendly, slightly witty, very helpful. You're JSR AI, proudly built by Sarthak Singh.`,
          },
          ...transformed,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
