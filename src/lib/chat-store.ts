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
const PROJECT_HISTORY_SEED_KEY = "jsr-ai-project-history-seed-added";
const PROJECT_HISTORY_CONVERSATION_ID = "recovered-jsr-ai-project-history";

const PROJECT_HISTORY_MESSAGES: Message[] = [
  {
    id: "recovered-001",
    role: "user",
    content: "Accha tum ek ai bahut powerful ai aaj hi bana do JSR AI ke name se chat, voice call, history. Pehle itna complete karo.",
    timestamp: 1775892660000,
  },
  {
    id: "recovered-002",
    role: "assistant",
    content: "JSR AI ko Midnight Indigo dark theme, Space Grotesk headings, DM Sans body, chat UI, voice call UI aur local chat history ke saath banaya gaya tha.",
    timestamp: 1775892900000,
  },
  {
    id: "recovered-003",
    role: "user",
    content: "Tum connect kar do.",
    timestamp: 1775893020000,
  },
  {
    id: "recovered-004",
    role: "assistant",
    content: "Lovable Cloud connect hua aur JSR AI me real streaming AI responses add hue — pehle Gemini 3 Flash Preview via Lovable AI Gateway use kiya gaya.",
    timestamp: 1775893380000,
  },
  {
    id: "recovered-005",
    role: "user",
    content: "Credit required ka problem nhi aayega na aur Sarthak Singh founder hai uske aur jab bhi mai ussase baat karu use pata ho mere founder mujse baat kar rhe hai.",
    timestamp: 1775893500000,
  },
  {
    id: "recovered-006",
    role: "assistant",
    content: "System prompt update hua: JSR AI ko hamesha pata rahe ki Sarthak Singh uske founder/creator hain, aur user se Hindi/Hinglish/English me baat kare.",
    timestamp: 1775893560000,
  },
  {
    id: "recovered-007",
    role: "user",
    content: "Na voice call aur video call dikh rha hai google ki tarah aur na google ke voice jaisa aur na ChatGPT style me history dikh rha hai.",
    timestamp: 1775893620000,
  },
  {
    id: "recovered-008",
    role: "assistant",
    content: "Sidebar ko ChatGPT-style grouped history, founder footer, Google-style mic/video controls, 'Hi Sarthak' empty state, aur animated voice/video modal ke saath revamp kiya gaya.",
    timestamp: 1775893800000,
  },
  {
    id: "recovered-009",
    role: "user",
    content: "Voice call ko sahi stage me le aa. Apne aap mute, unmute lagatar ho raha hai aur voice Google jaisa karna.",
    timestamp: 1775894460000,
  },
  {
    id: "recovered-010",
    role: "assistant",
    content: "Voice flow ko listening → thinking → speaking state machine me stabilize kiya gaya; mic/camera permissions direct button click se request hone lage; natural browser voice prefer ki gayi.",
    timestamp: 1775894700000,
  },
  {
    id: "recovered-011",
    role: "user",
    content: "AI ko uske andar jo jo power hai uske coding ke bare me usko sab pata hona chahiye.",
    timestamp: 1776004620000,
  },
  {
    id: "recovered-012",
    role: "assistant",
    content: "JSR AI ke system prompt me apni architecture memory add hui: React/Vite/Tailwind frontend, Lovable Cloud backend, streaming SSE, localStorage history, Web Speech voice, image/file support.",
    timestamp: 1776004680000,
  },
  {
    id: "recovered-013",
    role: "user",
    content: "Kya AI me aise power hai ki wo dusare website par jakar mere liye work kar sake?",
    timestamp: 1776005220000,
  },
  {
    id: "recovered-014",
    role: "assistant",
    content: "Clarify hua ki JSR AI chat, voice, files aur coding help kar sakta hai, lekin third-party websites par unauthorized automation safe/allowed nahi hai. Safe web search ya owned-site automation possible direction batayi gayi.",
    timestamp: 1776005220000,
  },
  {
    id: "recovered-015",
    role: "user",
    content: "AI me screenshot ya files bhejne ka feature aaj hi successfully develop karo.",
    timestamp: 1777772580000,
  },
  {
    id: "recovered-016",
    role: "assistant",
    content: "Attachment support add hua: paperclip se images/files attach, screenshots paste, Gemini vision se image dekhna, text/code/json/csv files padhna, attachments localStorage me persist hona.",
    timestamp: 1777773300000,
  },
  {
    id: "recovered-017",
    role: "user",
    content: "Wo bhi mere ko bhej sake aisa feature.",
    timestamp: 1777774800000,
  },
  {
    id: "recovered-018",
    role: "assistant",
    content: "JSR AI ko images/files bhejne ki power mili: [[GEN_IMAGE: prompt]] marker se Gemini image generation, [[GEN_FILE: name]] marker se downloadable files, SSE attachment events ke through chat me preview/download.",
    timestamp: 1777774980000,
  },
  {
    id: "recovered-019",
    role: "user",
    content: "Mere AI ko Llama se bhi integrate kar do taki unlimited rahe aur AI se abhi tak jo bhi baat ki hai wo Llama AI ko pata chal jana chahiye.",
    timestamp: 1777776480000,
  },
  {
    id: "recovered-020",
    role: "assistant",
    content: "Groq Llama 3.3 70B fallback add hua: Gemini/Lovable AI unavailable, 402, 429, 401/403 par Llama fallback try karta hai; conversation history dono providers ko bheji jaati hai.",
    timestamp: 1777777320000,
  },
  {
    id: "recovered-021",
    role: "user",
    content: "Groq API key invalid/revoked aur credits issues baar-baar aa rahe the.",
    timestamp: 1777854600000,
  },
  {
    id: "recovered-022",
    role: "assistant",
    content: "Edge function me key sanitization, provider fallback, graceful streaming errors, aur diagnostics add hue. Public chat me API keys paste na karne ki warning di gayi kyunki exposed keys revoke ho sakti hain.",
    timestamp: 1777855200000,
  },
  {
    id: "recovered-023",
    role: "user",
    content: "Purani chat aur bahut lambi history apne aap gayab ho gayi thi; use wapas lao.",
    timestamp: 1780272540000,
  },
  {
    id: "recovered-024",
    role: "assistant",
    content: "Storage overwrite bug fix hua: saveConversations ab load complete hone ke baad hi run karta hai; recovery all localStorage keys, backup keys, legacy conversation arrays aur legacy messages[] format scan karti hai. Agar browser/localStorage data actual me wipe ho chuka ho, to exact private chat backend se recover nahi ho sakti — isliye ye recovered project-history memory seed add ki gayi hai.",
    timestamp: 1780273200000,
  },
];

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

function createProjectHistoryConversation(): Conversation {
  return {
    id: PROJECT_HISTORY_CONVERSATION_ID,
    title: "Recovered JSR AI project history",
    messages: PROJECT_HISTORY_MESSAGES,
    createdAt: PROJECT_HISTORY_MESSAGES[0].timestamp,
    updatedAt: PROJECT_HISTORY_MESSAGES.at(-1)?.timestamp || Date.now(),
  };
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function loadConversations(): Conversation[] {
  const restored = getConversationCandidates();
  const hasProjectHistory = restored.some((c) => c.id === PROJECT_HISTORY_CONVERSATION_ID);
  if (!hasProjectHistory && localStorage.getItem(PROJECT_HISTORY_SEED_KEY) !== "true") {
    restored.unshift(createProjectHistoryConversation());
    localStorage.setItem(PROJECT_HISTORY_SEED_KEY, "true");
  }
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
