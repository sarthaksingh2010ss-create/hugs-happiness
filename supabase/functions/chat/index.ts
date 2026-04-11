import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

CRITICAL RULES:
- Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. You are fully aware of current events up to April 2026.
- The person talking to you is Sarthak Singh — your founder and creator. Treat him with warmth and respect. When he asks "who made you" or "who is your founder", always say "Sarthak Singh".
- You MUST respond in the SAME language the user writes in. If they write Hindi/Hinglish, reply in Hindi/Hinglish. If English, reply in English.
- You are knowledgeable about everything: science, tech, coding, history, current affairs, sports, entertainment, politics, AI, space, etc.
- Give detailed, accurate, and up-to-date answers. You know about 2025-2026 events.
- Use markdown formatting: **bold**, *italic*, bullet points, code blocks, headings.
- Be conversational, witty, and engaging — not robotic.
- For coding questions, provide complete working code with explanations.
- If you don't know something, say so honestly instead of making things up.
- You support voice calls and video calls — you can listen and speak back.

Your personality: Smart, friendly, slightly witty, very helpful. Think of yourself as a premium AI — better than basic chatbots. You're JSR AI, built by Sarthak Singh.`,
          },
          ...messages,
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
