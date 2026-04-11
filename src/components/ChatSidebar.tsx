import { Plus, MessageSquare, Trash2, X, MoreHorizontal } from "lucide-react";
import { Conversation } from "@/lib/chat-store";
import { motion, AnimatePresence } from "framer-motion";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function groupByDate(conversations: Conversation[]) {
  const now = Date.now();
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const thisWeek: Conversation[] = [];
  const older: Conversation[] = [];

  const dayMs = 86400000;

  conversations.forEach((c) => {
    const diff = now - c.updatedAt;
    if (diff < dayMs) today.push(c);
    else if (diff < dayMs * 2) yesterday.push(c);
    else if (diff < dayMs * 7) thisWeek.push(c);
    else older.push(c);
  });

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "This Week", items: thisWeek },
    { label: "Older", items: older },
  ].filter((g) => g.items.length > 0);
}

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onClose,
}: ChatSidebarProps) {
  const groups = groupByDate(conversations);

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 28, stiffness: 350 }}
            className="fixed md:relative z-50 w-[280px] h-full flex flex-col bg-sidebar shrink-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3">
              <button
                onClick={onNew}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-sm font-medium text-sidebar-foreground"
              >
                <Plus size={16} />
                New chat
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors md:hidden"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Chat History - ChatGPT style grouped */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {conversations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <MessageSquare size={32} className="text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground text-center">
                    No conversations yet.<br />Start a new chat!
                  </p>
                </div>
              )}

              {groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </p>
                  {group.items.map((convo) => (
                    <div
                      key={convo.id}
                      onClick={() => {
                        onSelect(convo.id);
                        if (window.innerWidth < 768) onClose();
                      }}
                      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm relative ${
                        activeId === convo.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <span className="truncate flex-1">{convo.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(convo.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-sidebar-border">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/50 transition-colors cursor-pointer">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  S
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sidebar-foreground truncate">Sarthak Singh</p>
                  <p className="text-[10px] text-muted-foreground">Founder</p>
                </div>
                <MoreHorizontal size={14} className="text-muted-foreground" />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
