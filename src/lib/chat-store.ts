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
    return parsed.filter((c) => Array.isArray(c?.messages));
  } catch {
    return [];
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function loadConversations(): Conversation[] {
  const current = parseConversations(localStorage.getItem(STORAGE_KEY));
  if (current.length > 0) return current;

  const backup = parseConversations(localStorage.getItem(BACKUP_STORAGE_KEY));
  if (backup.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
    return backup;
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = parseConversations(localStorage.getItem(key));
    if (legacy.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(legacy));
      return legacy;
    }
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
