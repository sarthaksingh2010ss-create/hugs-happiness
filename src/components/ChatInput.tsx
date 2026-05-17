import { Send, Loader2, Mic, Video, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Attachment } from "@/lib/chat-store";
import { toast } from "@/hooks/use-toast";

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  isLoading: boolean;
}

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_FILES = 5;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function ChatInput({ onSend, onVoiceCall, onVideoCall, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (attachments.length + list.length > MAX_FILES) {
      toast({ variant: "destructive", title: "Limit", description: `Max ${MAX_FILES} files at a time` });
      return;
    }
    const next: Attachment[] = [];
    for (const f of list) {
      if (f.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: "Too large", description: `${f.name} > 8MB` });
        continue;
      }
      const dataUrl = await readAsDataURL(f);
      next.push({
        type: f.type.startsWith("image/") ? "image" : "file",
        name: f.name,
        mimeType: f.type || "application/octet-stream",
        dataUrl,
        size: f.size,
      });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const handleSubmit = () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    onSend(input.trim(), attachments.length ? attachments : undefined);
    setInput("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      await handleFiles(dt.files);
    }
  };

  const hasInput = input.trim().length > 0 || attachments.length > 0;

  return (
    <div className="p-3 pb-4">
      <div className="max-w-3xl mx-auto">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex flex-wrap gap-2 mb-2 px-1"
            >
              {attachments.map((a, i) => (
                <div key={i} className="relative group bg-secondary rounded-lg border border-border overflow-hidden">
                  {a.type === "image" ? (
                    <img src={a.dataUrl} alt={a.name} className="h-16 w-16 object-cover" />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 max-w-[200px]">
                      <FileText size={16} className="text-primary shrink-0" />
                      <div className="text-xs truncate">{a.name}</div>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))}
                    aria-label={`Remove attachment ${a.name}`}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-background/80 hover:bg-background flex items-center justify-center"
                    title="Remove"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 bg-secondary rounded-2xl px-3 py-2 border border-border focus-within:border-primary/40 transition-colors">
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image or file"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors shrink-0"
            title="Attach image or file"
          >
            <Paperclip size={18} className="text-muted-foreground hover:text-foreground transition-colors" aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message JSR AI..."
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none py-1.5 max-h-40"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5">
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

            <motion.button
              onClick={handleSubmit}
              disabled={!hasInput || isLoading}
              animate={{
                scale: hasInput ? 1 : 0.8,
                opacity: hasInput ? 1 : 0.4,
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
