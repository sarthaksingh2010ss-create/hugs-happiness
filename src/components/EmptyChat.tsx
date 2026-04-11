import { Sparkles, MessageSquare, Phone, Zap } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyChatProps {
  onSuggestion: (text: string) => void;
}

const suggestions = [
  { icon: Zap, text: "Explain quantum computing simply" },
  { icon: MessageSquare, text: "Write a poem about the stars" },
  { icon: Sparkles, text: "Help me debug my React code" },
  { icon: Phone, text: "What can you do with voice?" },
];

export default function EmptyChat({ onSuggestion }: EmptyChatProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mb-6"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        <Sparkles size={28} className="text-primary-foreground" />
      </motion.div>

      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-heading font-bold text-foreground mb-2"
      >
        Hello! I'm JSR AI
      </motion.h2>
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-muted-foreground text-sm mb-8 text-center max-w-sm"
      >
        Your powerful AI assistant. Ask me anything, or try a suggestion below.
      </motion.p>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md"
      >
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s.text)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/30 hover:bg-card/80 transition-all text-sm text-left"
          >
            <s.icon size={14} className="text-primary shrink-0" />
            <span className="text-foreground">{s.text}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
