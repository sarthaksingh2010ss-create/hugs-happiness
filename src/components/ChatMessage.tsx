import { Bot, User, FileText, Download, Zap } from "lucide-react";
import { Message } from "@/lib/chat-store";
import ReactMarkdown from "react-markdown";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion } from "framer-motion";

function extractJsrPlans(content: string): string[] {
  const plans: string[] = [];
  const re = /```jsr-plan\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) plans.push(m[1].trim());
  return plans;
}

function runPlanInExtension(planJson: string, onResult: (r: any) => void) {
  try {
    const plan = JSON.parse(planJson);
    let acked = false;
    const listener = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (e.data?.type === "JSR_PLAN_ACK") acked = true;
      if (e.data?.type === "JSR_PLAN_RESULT") {
        window.removeEventListener("message", listener);
        onResult(e.data.result);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ type: "JSR_RUN_PLAN", plan, source: "jsr-ai-web" }, "*");
    toast({ title: "▶ Plan sent to JSR AI Agent", description: "Naya tab khulega aur plan run hoga." });
    setTimeout(() => {
      if (!acked) {
        window.removeEventListener("message", listener);
        toast({ variant: "destructive", title: "Extension not detected", description: "JSR AI Agent extension install/enable karo, phir page reload karke try karo." });
      }
    }, 1500);
  } catch (e: any) {
    toast({ variant: "destructive", title: "Invalid plan JSON", description: e.message });
  }
}

interface ChatMessageProps {
  message: Message;
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [planResults, setPlanResults] = useState<Record<number, any>>({});

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 px-4 py-3 ${isUser ? "" : "bg-card/50"}`}
    >
      <div
        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isUser ? "bg-secondary" : "bg-primary/20"
        }`}
      >
        {isUser ? (
          <User size={14} className="text-secondary-foreground" />
        ) : (
          <Bot size={14} className="text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {isUser ? "You" : "JSR AI"}
        </p>

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((a, i) =>
              a.type === "image" ? (
                <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={a.dataUrl}
                    alt={a.name}
                    className="max-h-48 rounded-lg border border-border object-cover hover:opacity-90 transition-opacity"
                  />
                </a>
              ) : (
                <a
                  key={i}
                  href={a.dataUrl}
                  download={a.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary hover:bg-secondary/70 transition-colors max-w-xs"
                >
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground">{formatSize(a.size)}</div>
                  </div>
                  <Download size={14} className="text-muted-foreground" />
                </a>
              )
            )}
          </div>
        )}

        {message.content && (
          <div className="prose-chat text-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && message.content && extractJsrPlans(message.content).map((plan, i) => (
          <div key={i} className="mt-2 space-y-2">
            <button
              onClick={() => runPlanInExtension(plan, (r) => setPlanResults((p) => ({ ...p, [i]: r })))}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-xs font-semibold shadow-lg shadow-primary/20"
            >
              <Zap size={14} /> Run with JSR AI Agent
            </button>
            {planResults[i] && (
              <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs">
                <div className="font-semibold mb-1 text-primary">
                  {planResults[i].ok ? "✓ Plan completed" : "✗ Plan failed"}
                </div>
                {planResults[i].extracted?.length > 0 && (
                  <div className="mb-2">
                    <div className="text-muted-foreground mb-1">Extracted:</div>
                    {planResults[i].extracted.map((t: string, k: number) => (
                      <pre key={k} className="whitespace-pre-wrap break-words bg-background/60 rounded p-2 mb-1 text-[11px]">{t}</pre>
                    ))}
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Step log</summary>
                  <pre className="whitespace-pre-wrap break-words text-[10px] mt-1">{JSON.stringify(planResults[i].results || planResults[i].error, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
