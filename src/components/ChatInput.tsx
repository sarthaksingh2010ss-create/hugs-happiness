import { Send, Loader2, Mic, Video } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

interface ChatInputProps {
  onSend: (message: string) => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  isLoading: boolean;
}

export default function ChatInput({ onSend, onVoiceCall, onVideoCall, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasInput = input.trim().length > 0;

  return (
    <div className="p-3 pb-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-secondary rounded-2xl px-3 py-2 border border-border focus-within:border-primary/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message JSR AI..."
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1.5 max-h-40"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            {/* Voice Call - Google style mic button */}
            {!hasInput && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={onVoiceCall}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                title="Voice Call"
              >
                <Mic size={18} className="text-muted-foreground hover:text-foreground transition-colors" />
              </motion.button>
            )}

            {/* Video Call button */}
            {!hasInput && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={onVideoCall}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                title="Video Call"
              >
                <Video size={18} className="text-muted-foreground hover:text-foreground transition-colors" />
              </motion.button>
            )}

            {/* Send button - shows when typing */}
            <motion.button
              onClick={handleSubmit}
              disabled={!hasInput || isLoading}
              animate={{ 
                scale: hasInput ? 1 : 0.8,
                opacity: hasInput ? 1 : 0.4 
              }}
              className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {isLoading ? (
                <Loader2 size={15} className="text-primary-foreground animate-spin" />
              ) : (
                <Send size={15} className="text-primary-foreground" />
              )}
            </motion.button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          JSR AI can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}
