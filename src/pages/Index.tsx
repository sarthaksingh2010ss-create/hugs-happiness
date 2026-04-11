import { useState, useEffect, useRef, useCallback } from "react";
import { Menu } from "lucide-react";
import ChatSidebar from "@/components/ChatSidebar";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import VoiceCall from "@/components/VoiceCall";
import EmptyChat from "@/components/EmptyChat";
import { toast } from "@/hooks/use-toast";
import { streamChat } from "@/lib/ai-stream";
import {
  Conversation,
  Message,
  loadConversations,
  saveConversations,
  createConversation,
  generateId,
  generateTitle,
} from "@/lib/chat-store";

export default function Index() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [callMode, setCallMode] = useState<"voice" | "video">("voice");
  const [callStream, setCallStream] = useState<MediaStream | null>(null);
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

      // Get current messages for context
      const currentConvo = conversations.find((c) => c.id === convoId);
      const previousMessages = currentConvo?.messages ?? [];

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

      const aiMsgId = generateId();
      let assistantContent = "";

      // Create empty assistant message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convoId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: aiMsgId, role: "assistant" as const, content: "", timestamp: Date.now() },
                ],
                updatedAt: Date.now(),
              }
            : c
        )
      );

      try {
        await streamChat({
          messages: [
            ...previousMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content },
          ],
          onDelta: (chunk) => {
            assistantContent += chunk;
            const snap = assistantContent;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convoId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === aiMsgId ? { ...m, content: snap } : m
                      ),
                    }
                  : c
              )
            );
          },
          onDone: () => setIsLoading(false),
        });
      } catch (e) {
        console.error(e);
        // Remove empty assistant message on error
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convoId
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== aiMsgId),
                }
              : c
          )
        );
        setIsLoading(false);
      }
    },
    [activeId, conversations]
  );

  const startCall = useCallback(
    async (mode: "voice" | "video") => {
      try {
        const constraints =
          mode === "video"
            ? { audio: true, video: { facingMode: "user" } }
            : { audio: true, video: false };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setCallStream(stream);
        setCallMode(mode);
        setShowCall(true);
      } catch (error) {
        console.error("Media permission error:", error);
        toast({
          variant: "destructive",
          title: "Permission needed",
          description: mode === "video"
            ? "Camera aur microphone allow kijiye to start video call."
            : "Microphone allow kijiye to start voice call.",
        });
      }
    },
    []
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => setActiveId(id)}
        onNew={handleNew}
        onDelete={handleDelete}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0">
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

        {activeConvo && activeConvo.messages.length > 0 ? (
          <div className="flex-1 overflow-y-auto">
            {activeConvo.messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && activeConvo.messages[activeConvo.messages.length - 1]?.content === "" && (
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

        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          onVoiceCall={() => void startCall("voice")}
          onVideoCall={() => void startCall("video")}
        />
      </main>

      <VoiceCall
        isOpen={showCall}
        onClose={() => {
          setShowCall(false);
          setCallStream(null);
        }}
        mode={callMode}
        mediaStream={callStream}
      />
    </div>
  );
}
