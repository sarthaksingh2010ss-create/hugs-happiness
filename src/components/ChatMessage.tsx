import { Bot, User, FileText, Download, Play, Zap } from "lucide-react";
import { Message } from "@/lib/chat-store";
import ReactMarkdown from "react-markdown";
import { toast } from "@/hooks/use-toast";

function extractJsrPlans(content: string): string[] {
  const plans: string[] = [];
  const re = /```jsr-plan\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) plans.push(m[1].trim());
  return plans;
}

function runPlanInExtension(planJson: string) {
  try {
    const plan = JSON.parse(planJson);
    window.postMessage({ type: "JSR_RUN_PLAN", plan, source: "jsr-ai-web" }, "*");
    toast({ title: "▶ Plan sent to JSR AI Agent", description: "Extension naya tab kholega aur plan run karega." });
    // Fallback: if extension not installed, no listener will respond. Detect with a short timer.
    let acked = false;
    const ackListener = (e: MessageEvent) => {
      if (e.data?.type === "JSR_PLAN_ACK") { acked = true; window.removeEventListener("message", ackListener); }
    };
    window.addEventListener("message", ackListener);
    setTimeout(() => {
      if (!acked) {
        toast({ variant: "destructive", title: "Extension not detected", description: "JSR AI Agent extension install/enable karo, phir try karo." });
      }
      window.removeEventListener("message", ackListener);
    }, 1500);
  } catch (e: any) {
    toast({ variant: "destructive", title: "Invalid plan JSON", description: e.message });
  }
}
import { motion } from "framer-motion";

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
      </div>
    </motion.div>
  );
}
