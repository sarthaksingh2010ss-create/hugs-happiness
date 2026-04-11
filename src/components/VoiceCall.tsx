import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { streamChat } from "@/lib/ai-stream";

interface VoiceCallProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "voice" | "video";
  mediaStream?: MediaStream | null;
}

type CallPhase = "connecting" | "listening" | "thinking" | "speaking" | "muted" | "unsupported" | "error";
type HistoryMessage = { role: "user" | "assistant"; content: string };

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: null | (() => void);
  onresult: null | ((event: SpeechRecognitionEventLike) => void);
  onerror: null | ((event: { error: string }) => void);
  onend: null | (() => void);
  start: () => void;
  abort: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
    length: number;
  }>;
}

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

const stripMarkdownForSpeech = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " code block skipped ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[-*]\s/g, "")
    .replace(/\s+/g, " ")
    .trim();

const pickPreferredVoice = (voices: SpeechSynthesisVoice[], lang: string) => {
  const langPrefix = lang.slice(0, 2).toLowerCase();
  const candidates = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));

  return (
    candidates.find((voice) => /google|assistant|natural/i.test(voice.name)) ||
    candidates.find((voice) => /female|india|hindi|english/i.test(voice.name)) ||
    candidates[0] ||
    voices.find((voice) => /google|assistant/i.test(voice.name)) ||
    null
  );
};

export default function VoiceCall({ isOpen, onClose, mode, mediaStream = null }: VoiceCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const synthRef = useRef(typeof window !== "undefined" ? window.speechSynthesis : null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const phaseRef = useRef<CallPhase>("connecting");
  const historyRef = useRef<HistoryMessage[]>([]);
  const startListeningRef = useRef<() => void>(() => undefined);
  const handleUserSpeechRef = useRef<(text: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    restartTimeoutRef.current = undefined;
  }, []);

  const stopRecognition = useCallback(() => {
    clearRestartTimeout();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    if (!recognition) return;

    try {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    } catch {
      // ignore cleanup failures
    }
  }, [clearRestartTimeout]);

  const stopMedia = useCallback(() => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const queueListeningRestart = useCallback((delay = 400) => {
    clearRestartTimeout();

    if (
      !activeRef.current ||
      mutedRef.current ||
      !SpeechRecognitionCtor ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "speaking"
    ) {
      return;
    }

    restartTimeoutRef.current = setTimeout(() => {
      startListeningRef.current();
    }, delay);
  }, [clearRestartTimeout]);

  handleUserSpeechRef.current = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || !activeRef.current || mutedRef.current) return;

    stopRecognition();
    setTranscript(text);
    setAiResponse("");
    setPhase("thinking");

    const nextHistory: HistoryMessage[] = [...historyRef.current, { role: "user", content: text }];
    historyRef.current = nextHistory;

    let fullResponse = "";

    try {
      await streamChat({
        messages: nextHistory,
        onDelta: (chunk) => {
          fullResponse += chunk;
          setAiResponse(fullResponse);
        },
        onDone: () => undefined,
      });

      const assistantText = fullResponse.trim() || "Sorry, mujhe is par clear response nahi mila.";
      historyRef.current = [...nextHistory, { role: "assistant", content: assistantText }];

      if (!activeRef.current) return;
      if (mutedRef.current || !synthRef.current) {
        setPhase(mutedRef.current ? "muted" : "listening");
        queueListeningRestart(250);
        return;
      }

      const speechText = stripMarkdownForSpeech(assistantText).slice(0, 420);
      const utterance = new SpeechSynthesisUtterance(speechText);
      const detectedLang = /[\u0900-\u097F]/.test(speechText) ? "hi-IN" : "en-US";
      const voices = synthRef.current.getVoices();
      const preferredVoice = pickPreferredVoice(voices, detectedLang);

      utterance.lang = preferredVoice?.lang || detectedLang;
      utterance.voice = preferredVoice || null;
      utterance.rate = 0.96;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        if (!activeRef.current) return;
        setPhase(mutedRef.current ? "muted" : "listening");
        setTranscript("");
        setAiResponse("");
        queueListeningRestart(250);
      };

      utterance.onerror = () => {
        if (!activeRef.current) return;
        setPhase(mutedRef.current ? "muted" : "listening");
        queueListeningRestart(500);
      };

      setPhase("speaking");
      synthRef.current.cancel();
      synthRef.current.speak(utterance);
    } catch (error) {
      console.error("Voice chat error:", error);
      if (!activeRef.current) return;
      setPhase(mutedRef.current ? "muted" : "listening");
      queueListeningRestart(800);
    }
  };

  startListeningRef.current = () => {
    if (
      !activeRef.current ||
      mutedRef.current ||
      !SpeechRecognitionCtor ||
      recognitionRef.current ||
      phaseRef.current === "thinking" ||
      phaseRef.current === "speaking"
    ) {
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language.toLowerCase().startsWith("hi") ? "hi-IN" : "en-IN";

      recognition.onstart = () => {
        if (!activeRef.current || mutedRef.current) return;
        setPhase("listening");
        setTranscript("");
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) finalTranscript += result[0].transcript;
          else interimTranscript += result[0].transcript;
        }

        setTranscript(finalTranscript || interimTranscript);

        if (finalTranscript.trim().length >= 2) {
          void handleUserSpeechRef.current(finalTranscript);
        }
      };

      recognition.onerror = (event) => {
        recognitionRef.current = null;
        if (!activeRef.current) return;

        if (event.error === "aborted") return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setPhase("error");
          return;
        }
        if (event.error === "no-speech") {
          setTranscript("");
          queueListeningRestart(700);
          return;
        }

        queueListeningRestart(1000);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (!activeRef.current || mutedRef.current) return;
        if (phaseRef.current === "listening") queueListeningRestart(350);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error("Recognition start failed:", error);
      recognitionRef.current = null;
      queueListeningRestart(1000);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    activeRef.current = true;
    historyRef.current = [];
    setDuration(0);
    setIsMuted(false);
    setTranscript("");
    setAiResponse("");
    setPhase(SpeechRecognitionCtor ? "connecting" : "unsupported");

    synthRef.current?.cancel();
    synthRef.current?.getVoices();

    timerRef.current = setInterval(() => setDuration((current) => current + 1), 1000);

    if (mode === "video" && mediaStream) {
      streamRef.current = mediaStream;
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    }

    if (SpeechRecognitionCtor) {
      queueListeningRestart(300);
    }

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      clearRestartTimeout();
      stopRecognition();
      synthRef.current?.cancel();
      stopMedia();
    };
  }, [clearRestartTimeout, isOpen, mediaStream, mode, queueListeningRestart, stopMedia, stopRecognition]);

  useEffect(() => {
    if (!isOpen) return;

    if (isMuted) {
      stopRecognition();
      synthRef.current?.cancel();
      setPhase("muted");
      return;
    }

    if (activeRef.current && phaseRef.current === "muted") {
      setPhase("listening");
      queueListeningRestart(200);
    }
  }, [isMuted, isOpen, queueListeningRestart, stopRecognition]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !isCamOff;
    });
  }, [isCamOff]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEnd = () => {
    activeRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    clearRestartTimeout();
    stopRecognition();
    synthRef.current?.cancel();
    stopMedia();
    onClose();
  };

  const statusText: Record<CallPhase, string> = {
    connecting: "Connecting…",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    muted: "Mic muted",
    unsupported: "Voice not supported in this browser",
    error: "Microphone permission blocked",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/98 backdrop-blur-2xl flex flex-col items-center justify-center"
        >
          {mode === "video" && !isCamOff && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover opacity-20"
            />
          )}

          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", damping: 24 }}
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 px-6"
          >
            <div className="relative">
              {phase === "listening" && (
                <>
                  <div className="absolute inset-[-8px] rounded-full bg-primary/20 animate-voice-pulse" />
                  <div className="absolute inset-[-22px] rounded-full bg-primary/10 animate-voice-pulse [animation-delay:0.45s]" />
                </>
              )}
              {phase === "speaking" && (
                <>
                  <div className="absolute inset-[-8px] rounded-full bg-accent/20 animate-voice-pulse" />
                  <div className="absolute inset-[-22px] rounded-full bg-accent/10 animate-voice-pulse [animation-delay:0.45s]" />
                </>
              )}
              {phase === "thinking" && (
                <div
                  className="absolute inset-[-10px] rounded-full border-2 border-primary/30 animate-spin"
                  style={{ animationDuration: "1.8s" }}
                />
              )}

              <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-2xl">
                <span className="font-heading text-3xl font-bold text-primary-foreground">JSR</span>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-xl font-heading font-semibold text-foreground">
                JSR AI {mode === "video" ? "Video" : "Voice"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{statusText[phase]}</p>
              <p className="mt-1 font-mono text-lg tracking-wider text-primary">{formatTime(duration)}</p>
            </div>

            <div className="min-h-[92px] w-full max-w-sm overflow-y-auto">
              {transcript && phase === "listening" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-secondary/70 px-4 py-3 text-center text-sm text-foreground"
                >
                  🎙️ {transcript}
                </motion.div>
              )}
              {aiResponse && (phase === "thinking" || phase === "speaking") && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-card/80 px-4 py-3 text-center text-sm text-foreground"
                >
                  {aiResponse.slice(0, 220)}
                  {aiResponse.length > 220 ? "…" : ""}
                </motion.div>
              )}
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={() => setIsMuted((current) => !current)}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all shadow-lg ${
                  isMuted
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                onClick={handleEnd}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xl transition-colors hover:bg-destructive/90"
              >
                <PhoneOff size={24} />
              </button>

              {mode === "video" && (
                <button
                  onClick={() => setIsCamOff((current) => !current)}
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition-all shadow-lg ${
                    isCamOff
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {isCamOff ? <VideoOff size={22} /> : <Video size={22} />}
                </button>
              )}
            </div>

            <p className="max-w-xs text-center text-xs text-muted-foreground">
              Google-style closest available browser voice use ho rahi hai. Exact Google AI voice ke liye dedicated cloud TTS integration chahiye.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
