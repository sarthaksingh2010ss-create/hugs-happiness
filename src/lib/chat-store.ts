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

export function generateId(): string {
  return crypto.randomUUID();
}

export function loadConversations(): Conversation[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveConversations(convos: Conversation[]): void {
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
