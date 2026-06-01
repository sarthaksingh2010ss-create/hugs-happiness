import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function streamTextResponse(message: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: message } }] })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

function providerErrorMessage(status: number, usingFallback: boolean): string {
  if (status === 401 || status === 403) {
    return usingFallback
      ? "AI fallback authorization abhi fail ho raha hai. Maine key format cleanup apply kar diya hai; agar issue rahe to credits/fallback provider side check karna padega."
      : "AI service authorization fail ho gaya. Please backend AI key check/update karein.";
  }
  if (status === 402) return "AI credits exhausted hain. Please Workspace usage mein credits add kar dein ya valid fallback key use karein.";
  if (status === 429) return "AI service abhi rate limit kar raha hai. Thodi der baad dobara try karein.";
  if (status >= 500) return "AI service abhi unavailable hai. Please ek minute baad dobara try karein.";
  return "AI response generate nahi ho paya. Please dobara try karein.";
}

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
    const meta = dataUrl.slice(5, comma);
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

const SYSTEM_PROMPT = `You are JSR AI, a powerful, intelligent, and friendly AI assistant. You were created by Sarthak Singh, your founder.

ABOUT YOURSELF:
- You are JSR AI, built by Sarthak Singh.
- Your brain runs on Google Gemini 3 Flash Preview via Lovable AI Gateway.
- You can SEE images, READ text files attached by user.
- You CAN SEND IMAGES and FILES back to user using special markers (see below).
- React 18 + TS + Vite + Tailwind + Framer Motion frontend, Supabase backend.
- Speak Hindi, Hinglish, English — match user's language.

LONG-TERM PROJECT MEMORY WITH SARTHAK:
- Sarthak first asked to build a powerful AI named JSR AI with chat, voice call, and history.
- JSR AI was created with a Midnight Indigo dark theme, Space Grotesk headings, DM Sans body, ChatGPT-style sidebar history, Google-style voice/video controls, and founder personalization.
- Sarthak Singh is your founder and creator; always recognize him respectfully without asking again.
- You were first connected to Gemini 3 Flash Preview through Lovable AI Gateway for real streaming replies.
- You were later given awareness of your own coding and powers: React 18, TypeScript, Vite, Tailwind, Framer Motion frontend, Lovable Cloud backend, streaming SSE, localStorage history, Web Speech API voice/video flow, file/image attachments, and generated image/file attachments.
- Voice call was stabilized with a listening → thinking → speaking flow, direct mic/camera permission on button click, and natural browser voice selection.
- Sarthak asked for screenshot/file upload; you can see images, read text/code/json/csv files, and use attachments as context.
- Sarthak asked that you send images/files back; you can use [[GEN_IMAGE: ...]] and [[GEN_FILE: ...]] markers.
- Groq Llama 3.3 70B fallback was added for credit/rate-limit issues, but valid non-exposed API keys are required for that provider.
- Old local chat history disappeared because browser localStorage can be overwritten/cleared; recovery now scans backup/legacy keys and includes a recovered project-history conversation. If the exact original browser storage is gone, use this memory to continue the relationship and context.
- If Sarthak asks about old conversations, acknowledge the issue directly, reassure him that you remember the project context above, and continue from it.

🎁 HOW TO SEND IMAGES TO USER:
When user asks for an image, picture, photo, screenshot, diagram, drawing, logo, illustration — generate one by writing this marker on its own line:
[[GEN_IMAGE: detailed english prompt of the image to generate]]
Example: User says "ek sunset bana ke do" → You write a short message + on a new line: [[GEN_IMAGE: A breathtaking sunset over mountains, golden hour, vibrant orange and purple sky, cinematic photography]]
The system will replace this marker with an actual generated image attached to your message.

📄 HOW TO SEND FILES TO USER:
When user wants a file (code file, csv, json, txt, markdown, config), write this marker:
[[GEN_FILE: filename.ext]]
\`\`\`
<full file content here>
\`\`\`
Example: User says "ek package.json bana" → You write a short note + then:
[[GEN_FILE: package.json]]
\`\`\`
{ "name": "demo", "version": "1.0.0" }
\`\`\`
The system will turn the code block into a downloadable file attachment.

RULES FOR MARKERS:
- Use [[GEN_IMAGE: ...]] only when user clearly wants a visual — don't spam it.
- Use [[GEN_FILE: ...]] when user wants a downloadable file. For just showing code in chat, use normal markdown code blocks WITHOUT the marker.
- You may send multiple images/files in one response.
- Always add a short friendly text message along with the marker.

CRITICAL:
- Today: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
- The user is Sarthak Singh — your founder. Be warm and respectful.
- Use markdown. Be conversational, witty, helpful.

Personality: Smart, friendly, slightly witty, very helpful. Proudly built by Sarthak Singh.`;

async function generateImage(prompt: string, apiKey: string): Promise<Attachment | null> {
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "jsr-ai-edge", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!resp.ok) {
      console.error("image gen failed:", resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const images = json.choices?.[0]?.message?.images;
    const url = images?.[0]?.image_url?.url;
    if (!url) {
      console.error("no image in response", JSON.stringify(json).slice(0, 500));
      return null;
    }
    // url is a data URL
    const size = Math.floor((url.length - url.indexOf(",") - 1) * 0.75);
    return {
      type: "image",
      name: `generated-${Date.now()}.png`,
      mimeType: "image/png",
      dataUrl: url,
      size,
    };
  } catch (e) {
    console.error("image gen error:", e);
    return null;
  }
}

function fileToAttachment(name: string, content: string): Attachment {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    json: "application/json", csv: "text/csv", txt: "text/plain", md: "text/markdown",
    html: "text/html", css: "text/css", js: "text/javascript", ts: "text/typescript",
    tsx: "text/typescript", jsx: "text/javascript", xml: "application/xml",
    yaml: "text/yaml", yml: "text/yaml", py: "text/x-python", sh: "text/x-sh",
  };
  const mime = mimeMap[ext] ?? "text/plain";
  const b64 = btoa(unescape(encodeURIComponent(content)));
  return {
    type: "file",
    name,
    mimeType: mime,
    dataUrl: `data:${mime};base64,${b64}`,
    size: new TextEncoder().encode(content).length,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages: IncomingMessage[] };
    const sanitizeKey = (k: string | undefined, envName?: string) => {
      let value = k?.replace(/[^\x20-\x7E]/g, "").trim();
      if (!value) return value;
      if (envName && value.includes("=")) {
        const match = value.match(new RegExp(`${envName}\\s*=\\s*['\"]?([^'\"\\s]+)`, "i"));
        value = match?.[1] ?? value.split("=").pop()?.trim() ?? value;
      }
      if (envName === "GROQ_API_KEY") {
        const groqToken = value.match(/gsk_[^\s'\"]+/)?.[0];
        if (groqToken) value = groqToken;
      }
      return value.replace(/^['\"]|['\"]$/g, "").trim();
    };
    const rawLovable = Deno.env.get("LOVABLE_API_KEY");
    const LOVABLE_API_KEY = rawLovable?.replace(/[^\x20-\x7E]/g, "").trim();
    console.log("LOVABLE key debug:", { hasRaw: !!rawLovable, rawLen: rawLovable?.length ?? 0, cleanLen: LOVABLE_API_KEY?.length ?? 0, prefix: LOVABLE_API_KEY?.slice(0, 4) });

    const transformed = messages.map((m) => ({ role: m.role, content: buildContent(m) }));
    const GROQ_API_KEY = sanitizeKey(Deno.env.get("GROQ_API_KEY"), "GROQ_API_KEY");
    console.log("GROQ key debug:", { hasKey: !!GROQ_API_KEY, len: GROQ_API_KEY?.length ?? 0, startsGsk: GROQ_API_KEY?.startsWith("gsk_") ?? false });

    const flattenForGroq = (content: unknown): string => {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content.map((p: any) => {
          if (p?.type === "text") return p.text ?? "";
          if (p?.type === "image_url") return "[user attached an image — vision unavailable on fallback model]";
          return "";
        }).join("\n");
      }
      return String(content ?? "");
    };

    const callLovable = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": LOVABLE_API_KEY, "X-Lovable-AIG-SDK": "jsr-ai-edge", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...transformed],
        stream: true,
      }),
    });

    const callGroq = () => fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\n[Running on Llama 3.3 70B via Groq fallback. Vision disabled, but image/file generation markers still work.]" },
          ...transformed.map((m) => ({ role: m.role, content: flattenForGroq(m.content) })),
        ],
        stream: true,
      }),
    });

    let upstream: Response | null = LOVABLE_API_KEY ? await callLovable() : null;
    let usingFallback = !LOVABLE_API_KEY;

    if ((!upstream || (!upstream.ok && (upstream.status === 402 || upstream.status === 429 || upstream.status === 401 || upstream.status === 403))) && GROQ_API_KEY) {
      console.log(upstream ? `Lovable AI ${upstream.status}, falling back to Groq` : "No Lovable key, using Groq");
      upstream = await callGroq();
      usingFallback = true;
    }

    if (!upstream) {
      return streamTextResponse("Koi bhi AI provider key configure nahi hai. LOVABLE_API_KEY ya GROQ_API_KEY add karein.");
    }

    if (!upstream.ok) {
      const t = await upstream.text();
      console.error(`AI provider error (fallback=${usingFallback}):`, upstream.status, t);
      return streamTextResponse(providerErrorMessage(upstream.status, usingFallback));
    }

    // We intercept the stream to:
    //  1) accumulate full text
    //  2) detect [[GEN_IMAGE: ...]] and [[GEN_FILE: name]]```...``` markers
    //  3) strip them from the streamed text and emit attachment events
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const out = new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        let raw = "";
        let assistantText = ""; // running full text from upstream
        let emittedUpTo = 0;    // index in assistantText already streamed to client (after marker stripping)
        let cleanText = "";     // marker-stripped text accumulated

        const sendDelta = (text: string) => {
          if (!text) return;
          const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };
        const sendAttachment = (att: Attachment) => {
          const chunk = `data: ${JSON.stringify({ attachment: att })}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        };

        // Process current assistantText: extract any complete markers, generate, emit
        // Returns the marker-stripped text suitable for streaming.
        const processMarkers = async (finalize: boolean): Promise<string> => {
          let working = assistantText;
          let cleaned = "";
          let i = 0;

          while (i < working.length) {
            // find next marker start
            const imgIdx = working.indexOf("[[GEN_IMAGE:", i);
            const fileIdx = working.indexOf("[[GEN_FILE:", i);
            let nextIdx = -1;
            let kind: "img" | "file" | null = null;
            if (imgIdx !== -1 && (fileIdx === -1 || imgIdx < fileIdx)) { nextIdx = imgIdx; kind = "img"; }
            else if (fileIdx !== -1) { nextIdx = fileIdx; kind = "file"; }

            if (nextIdx === -1) {
              // no more markers — but to be safe, only commit text we're sure won't be eaten by a partial marker
              if (finalize) {
                cleaned += working.slice(i);
                i = working.length;
              } else {
                // hold back last 12 chars in case a marker is forming
                const safeEnd = Math.max(i, working.length - 12);
                cleaned += working.slice(i, safeEnd);
                i = safeEnd;
                // leave the rest pending in working (we won't commit it now)
                break;
              }
              break;
            }

            // commit text before marker
            cleaned += working.slice(i, nextIdx);

            if (kind === "img") {
              const end = working.indexOf("]]", nextIdx);
              if (end === -1) {
                if (!finalize) { /* incomplete, wait */ break; }
                cleaned += working.slice(nextIdx); // dump as-is
                i = working.length;
                break;
              }
              const prompt = working.slice(nextIdx + "[[GEN_IMAGE:".length, end).trim();
              i = end + 2;
              // generate image
              const att = await generateImage(prompt, LOVABLE_API_KEY);
              if (att) {
                sendAttachment(att);
              } else {
                cleaned += `\n*(image generation failed)*\n`;
              }
            } else if (kind === "file") {
              const nameEnd = working.indexOf("]]", nextIdx);
              if (nameEnd === -1) { if (!finalize) break; cleaned += working.slice(nextIdx); i = working.length; break; }
              const name = working.slice(nextIdx + "[[GEN_FILE:".length, nameEnd).trim();
              // expect ```...``` after
              const fenceStart = working.indexOf("```", nameEnd);
              if (fenceStart === -1) { if (!finalize) break; cleaned += working.slice(nextIdx); i = working.length; break; }
              // skip language line
              const afterFence = working.indexOf("\n", fenceStart);
              if (afterFence === -1) { if (!finalize) break; cleaned += working.slice(nextIdx); i = working.length; break; }
              const fenceEnd = working.indexOf("```", afterFence + 1);
              if (fenceEnd === -1) { if (!finalize) break; cleaned += working.slice(nextIdx); i = working.length; break; }
              const content = working.slice(afterFence + 1, fenceEnd).replace(/\n$/, "");
              i = fenceEnd + 3;
              const att = fileToAttachment(name, content);
              sendAttachment(att);
            }
          }

          return cleaned;
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            raw += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = raw.indexOf("\n")) !== -1) {
              let line = raw.slice(0, nl);
              raw = raw.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const p = JSON.parse(json);
                const delta = p.choices?.[0]?.delta?.content as string | undefined;
                if (delta) {
                  assistantText += delta;
                  // process markers progressively
                  const newCleaned = await processMarkers(false);
                  // newCleaned is the full clean text we can commit; emit only the new portion
                  if (newCleaned.length > cleanText.length) {
                    sendDelta(newCleaned.slice(cleanText.length));
                    cleanText = newCleaned;
                  }
                }
              } catch { /* ignore */ }
            }
          }

          // finalize
          const finalCleaned = await processMarkers(true);
          if (finalCleaned.length > cleanText.length) {
            sendDelta(finalCleaned.slice(cleanText.length));
            cleanText = finalCleaned;
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          console.error("stream processing error:", e);
          sendDelta("AI response stream beech mein fail ho gaya. Please dobara try karein.");
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(out, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return streamTextResponse("Chat service abhi response start nahi kar paaya. Please dobara try karein.");
  }
});
