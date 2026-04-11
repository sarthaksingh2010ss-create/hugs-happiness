import { Bot, User } from "lucide-react";
import { Message } from "@/lib/chat-store";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

interface ChatMessageProps {
  message: Message;
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
        <div className="prose-chat text-foreground">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}
