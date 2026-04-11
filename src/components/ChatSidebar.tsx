import { Plus, MessageSquare, Trash2, Phone } from "lucide-react";
import { Conversation } from "@/lib/chat-store";
import { motion, AnimatePresence } from "framer-motion";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onVoiceCall: () => void;
  isOpen: boolean;
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onVoiceCall,
  isOpen,
}: ChatSidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: -280 }}
          animate={{ x: 0 }}
          exit={{ x: -280 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-[280px] h-full flex flex-col bg-sidebar border-r border-sidebar-border shrink-0"
        >
          {/* Logo */}
          <div className="p-4 border-b border-sidebar-border">
            <h1 className="text-xl font-heading font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              JSR AI
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Powerful AI Assistant</p>
          </div>

          {/* Actions */}
          <div className="p-3 space-y-2">
            <button
              onClick={onNew}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium"
            >
              <Plus size={16} />
              New Chat
            </button>
            <button
              onClick={onVoiceCall}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors text-sm font-medium"
            >
              <Phone size={16} />
              Voice Call
            </button>
          </div>

          {/* History */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              History
            </p>
            {conversations.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                No conversations yet
              </p>
            )}
            {conversations.map((convo) => (
              <div
                key={convo.id}
                onClick={() => onSelect(convo.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                  activeId === convo.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <MessageSquare size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{convo.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(convo.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-sidebar-border">
            <p className="text-[10px] text-muted-foreground text-center">
              JSR AI v1.0 • Built with ❤️
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
