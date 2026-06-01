export interface Attachment {
  type: "image" | "file";
  name: string;
  mimeType: string;
  /** data URL (base64) for images; for files it's also a data URL so it persists in localStorage */
  dataUrl: string;
  size: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "jsr-ai-conversations";
const BACKUP_STORAGE_KEY = "jsr-ai-conversations-backup";
const LEGACY_STORAGE_KEYS = ["conversations", "chat-conversations", "jsr-conversations", "messages"];

function parseConversations(value: string | null): Conversation[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    if (parsed.every((m) => m?.role && typeof m?.content === "string")) {
      const messages = normalizeMessages(parsed);
      return messages.length > 0
        ? [{
            id: "recovered-legacy-messages",
            title: generateTitle(messages),
            messages,
            createdAt: messages[0]?.timestamp || Date.now(),
            updatedAt: messages.at(-1)?.timestamp || Date.now(),
          }]
        : [];
    }
    return parsed.filter((c) => Array.isArray(c?.messages));
  } catch {
    return [];
  }
}

function normalizeMessages(messages: Partial<Message>[]): Message[] {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      id: m.id || generateId(),
      role: m.role as "user" | "assistant",
      content: m.content || "",
      timestamp: m.timestamp || Date.now(),
      attachments: m.attachments,
    }));
}

function getConversationCandidates(): Conversation[] {
  const keys = new Set([STORAGE_KEY, BACKUP_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]);
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key) keys.add(key);
  }

  const byId = new Map<string, Conversation>();
  keys.forEach((key) => {
    parseConversations(localStorage.getItem(key)).forEach((conversation) => {
      const messages = normalizeMessages(conversation.messages);
      if (messages.length === 0) return;
      const normalized: Conversation = {
        id: conversation.id || generateId(),
        title: conversation.title || generateTitle(messages),
        messages,
        createdAt: conversation.createdAt || messages[0]?.timestamp || Date.now(),
        updatedAt: conversation.updatedAt || messages.at(-1)?.timestamp || Date.now(),
      };
      const existing = byId.get(normalized.id);
      if (!existing || normalized.messages.length > existing.messages.length) {
        byId.set(normalized.id, normalized);
      }
    });
  });

  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function loadConversations(): Conversation[] {
  const restored = getConversationCandidates();
  if (restored.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(restored));
    return restored;
  }

  return [];
}

export function saveConversations(convos: Conversation[]): void {
  const existing = parseConversations(localStorage.getItem(STORAGE_KEY));
  if (existing.length > 0) {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(existing));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

export function createConversation(): Conversation {
  return {
    id: generateId(),
    title: "New Chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function generateTitle(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "New Chat";
  const title = firstUserMsg.content.slice(0, 40);
  return title.length < firstUserMsg.content.length ? title + "…" : title;
}
