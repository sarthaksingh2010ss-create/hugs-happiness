import { Sparkles, Code, PenLine, Lightbulb, Globe } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyChatProps {
  onSuggestion: (text: string) => void;
}

const suggestions = [
  { icon: Code, text: "Help me debug my code", color: "text-blue-400" },
  { icon: PenLine, text: "Write a creative story", color: "text-pink-400" },
  { icon: Lightbulb, text: "Explain quantum physics", color: "text-amber-400" },
  { icon: Globe, text: "Translate to Hindi", color: "text-emerald-400" },
];

export default function EmptyChat({ onSuggestion }: EmptyChatProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="relative mb-8"
      >
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          <Sparkles size={36} className="text-primary-foreground" />
        </div>
        {/* Floating ring */}
        <div className="absolute inset-[-4px] rounded-full border border-primary/20 animate-pulse" />
      </motion.div>

      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-3xl font-heading font-bold text-foreground mb-2"
      >
        Hi Sarthak! 👋
      </motion.h2>
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="text-muted-foreground text-sm mb-10 text-center max-w-sm"
      >
        How can I help you today? Ask me anything or pick a suggestion.
      </motion.p>

      <motion.div
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-2 gap-2.5 w-full max-w-lg px-2"
      >
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSuggestion(s.text)}
            className="flex flex-col gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/30 transition-all text-left group"
          >
            <s.icon size={18} className={`${s.color} group-hover:scale-110 transition-transform`} />
            <span className="text-sm text-foreground leading-snug">{s.text}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
