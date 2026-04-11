import { useState, useEffect, useRef, useCallback } from "react";
import { Menu } from "lucide-react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import VoiceCall from "@/components/VoiceCall";
import EmptyChat from "@/components/EmptyChat";
import {
  Conversation,
  Message,
  loadConversations,
  saveConversations,
  createConversation,
  generateId,
  generateTitle,
} from "@/lib/chat-store";

// Simple local AI responses (will be replaced with Lovable Cloud)
function getLocalResponse(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hlo"))
    return "Hello! 👋 I'm JSR AI, your powerful assistant. How can I help you today?";
  if (lower.includes("who are you") || lower.includes("your name"))
    return "I'm **JSR AI** — a powerful AI assistant built to help you with anything from coding to creative writing. Ask me anything!";
  if (lower.includes("quantum"))
    return "**Quantum computing** uses qubits instead of classical bits. Unlike bits (0 or 1), qubits can exist in *superposition* — being both 0 and 1 simultaneously. This allows quantum computers to solve certain problems exponentially faster than classical computers.\n\nKey concepts:\n- **Superposition**: Qubits in multiple states at once\n- **Entanglement**: Linked qubits that affect each other\n- **Quantum gates**: Operations on qubits";
  if (lower.includes("poem"))
    return "*Beneath the velvet sky so wide,*\n*A thousand stars begin to hide,*\n*Their whispers echo through the night,*\n*Like diamonds catching cosmic light.*\n\n*The moon, a lantern soft and pale,*\n*Illuminates each dream and tale.*";
  if (lower.includes("react") || lower.includes("code") || lower.includes("debug"))
    return "I'd love to help with your code! 🛠️ Here are some common React debugging tips:\n\n1. **Check the console** for error messages\n2. Use `React DevTools` to inspect component state\n3. Add `console.log` in `useEffect` to track renders\n4. Verify your **dependency arrays** in hooks\n\nShare your code and I'll take a closer look!";
  if (lower.includes("voice"))
    return "I support **voice calls**! Click the 🎙️ Voice Call button in the sidebar to start a voice conversation. Right now it's a demo — connect to **Lovable Cloud** for full voice AI capabilities.";
  if (lower.includes("help") || lower.includes("kya kar sakte ho"))
    return "I can help you with:\n\n- 💬 **Chat**: Ask questions, get answers\n- 🎙️ **Voice Call**: Talk to me directly\n- 📝 **Writing**: Essays, poems, stories\n- 💻 **Coding**: Debug, explain, write code\n- 🧠 **Learning**: Explain complex topics simply\n- 🌐 **Translation**: Translate text\n\nJust ask!";
  return `That's a great question! Here's what I think about "${msg.slice(0, 50)}${msg.length > 50 ? "..." : ""}":\n\nI'm currently running in **local mode** with limited responses. Connect me to **Lovable Cloud** to unlock my full AI capabilities with real-time streaming responses!\n\nFor now, try asking me about:\n- Quantum computing\n- Poetry\n- React debugging\n- What I can do`;
}

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadConversations();
    setConversations(loaded);
    if (loaded.length > 0) setActiveId(loaded[0].id);
  }, []);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId]);

  const activeConvo = conversations.find((c) => c.id === activeId) ?? null;

  const handleNew = useCallback(() => {
    const convo = createConversation();
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveId(remaining[0]?.id ?? null);
      }
    },
    [activeId, conversations]
  );

  const handleSend = useCallback(
    async (content: string) => {
      let convoId = activeId;

      if (!convoId) {
        const convo = createConversation();
        setConversations((prev) => [convo, ...prev]);
        convoId = convo.id;
        setActiveId(convo.id);
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId
            ? {
                ...c,
                messages: [...c.messages, userMsg],
                title: c.messages.length === 0 ? generateTitle([userMsg]) : c.title,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      setIsLoading(true);

      // Simulate AI delay
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));

      const aiMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: getLocalResponse(content),
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId
            ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() }
            : c
        )
      );

      setIsLoading(false);
    },
    [activeId]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          if (window.innerWidth < 768) setSidebarOpen(false);
        }}
        onNew={handleNew}
        onDelete={handleDelete}
        onVoiceCall={() => setShowVoice(true)}
        isOpen={sidebarOpen}
      />

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-12 border-b border-border flex items-center px-3 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Menu size={18} className="text-muted-foreground" />
          </button>
          <h2 className="text-sm font-heading font-medium text-foreground truncate">
            {activeConvo?.title ?? "JSR AI"}
          </h2>
        </header>

        {/* Messages */}
        {activeConvo && activeConvo.messages.length > 0 ? (
          <div className="flex-1 overflow-y-auto">
            {activeConvo.messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex gap-3 px-4 py-3 bg-card/50">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="flex items-center gap-1 pt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.15s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <EmptyChat onSuggestion={handleSend} />
        )}

        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </main>

      <VoiceCall isOpen={showVoice} onClose={() => setShowVoice(false)} />
    </div>
  );
}
