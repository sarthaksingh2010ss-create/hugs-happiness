import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { streamChat } from "@/lib/ai-stream";

interface VoiceCallProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "voice" | "video";
}

// Get SpeechRecognition API
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function VoiceCall({ isOpen, onClose, mode }: VoiceCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<"connecting" | "listening" | "thinking" | "speaking" | "muted">("connecting");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [conversationHistory, setConversationHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef(window.speechSynthesis);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start speech recognition
  const startListening = useCallback(() => {
    if (!SpeechRecognition || isMuted) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "hi-IN"; // Hindi + English mix support

      recognition.onstart = () => {
        setStatus("listening");
        setTranscript("");
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        setTranscript(finalTranscript || interimTranscript);

        if (finalTranscript) {
          handleUserSpeech(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error !== "aborted" && event.error !== "no-speech") {
          // Restart after error
          setTimeout(() => startListening(), 1000);
        }
      };

      recognition.onend = () => {
        // Auto-restart listening if not muted and still open
        if (!isMuted && isOpen && status !== "thinking" && status !== "speaking") {
          setTimeout(() => startListening(), 500);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
    }
  }, [isMuted, isOpen, status]);

  // Handle user's speech -> send to AI -> speak response
  const handleUserSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return;

    // Stop listening while AI processes
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    setStatus("thinking");
    setAiResponse("");

    const newHistory = [...conversationHistory, { role: "user" as const, content: text }];
    setConversationHistory(newHistory);

    let fullResponse = "";

    // Pre-create utterance in gesture context
    const utterance = new SpeechSynthesisUtterance("");

    try {
      await streamChat({
        messages: newHistory,
        onDelta: (chunk) => {
          fullResponse += chunk;
          setAiResponse(fullResponse);
        },
        onDone: () => {
          setConversationHistory((prev) => [
            ...prev,
            { role: "assistant" as const, content: fullResponse },
          ]);

          // Speak the response
          setStatus("speaking");

          // Clean markdown for speech
          const cleanText = fullResponse
            .replace(/\*\*(.*?)\*\*/g, "$1")
            .replace(/\*(.*?)\*/g, "$1")
            .replace(/#{1,6}\s/g, "")
            .replace(/```[\s\S]*?```/g, "code block skipped")
            .replace(/`(.*?)`/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[-*]\s/g, "")
            .slice(0, 500); // Limit speech length

          utterance.text = cleanText;
          utterance.lang = /[\u0900-\u097F]/.test(cleanText) ? "hi-IN" : "en-US";
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          // Get a good voice
          const voices = synthRef.current.getVoices();
          const preferred = voices.find(
            (v) => v.name.includes("Google") && v.lang.startsWith(utterance.lang.slice(0, 2))
          ) || voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2)));
          if (preferred) utterance.voice = preferred;

          utterance.onend = () => {
            setStatus("listening");
            startListening();
          };

          utterance.onerror = () => {
            setStatus("listening");
            startListening();
          };

          synthRef.current.cancel();
          synthRef.current.speak(utterance);
        },
      });
    } catch (e) {
      console.error("AI error:", e);
      setStatus("listening");
      startListening();
    }
  }, [conversationHistory, startListening]);

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      setDuration(0);
      setIsMuted(false);
      setIsCamOff(false);
      setTranscript("");
      setAiResponse("");
      setConversationHistory([]);
      setStatus("connecting");

      // Load voices
      synthRef.current.getVoices();

      // Start timer
      intervalRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Start camera for video mode
      if (mode === "video") {
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: false })
          .then((stream) => {
            streamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          })
          .catch((e) => console.error("Camera error:", e));
      }

      // Start listening after a brief delay
      setTimeout(() => {
        setStatus("listening");
        startListening();
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (recognitionRef.current) recognitionRef.current.abort();
      synthRef.current.cancel();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen]);

  // Handle mute toggle
  useEffect(() => {
    if (isMuted) {
      if (recognitionRef.current) recognitionRef.current.abort();
      synthRef.current.cancel();
      setStatus("muted");
    } else if (isOpen && status === "muted") {
      setStatus("listening");
      startListening();
    }
  }, [isMuted]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleEnd = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (recognitionRef.current) recognitionRef.current.abort();
    synthRef.current.cancel();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  };

  const statusText: Record<string, string> = {
    connecting: "Connecting...",
    listening: "🎙️ Listening...",
    thinking: "🤔 Thinking...",
    speaking: "🔊 Speaking...",
    muted: "Muted",
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
          {/* Video preview (background) */}
          {mode === "video" && !isCamOff && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-20"
            />
          )}

          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="flex flex-col items-center gap-6 relative z-10 px-6"
          >
            {/* Avatar with status-based pulse */}
            <div className="relative">
              {status === "listening" && (
                <>
                  <div className="absolute inset-[-8px] rounded-full bg-emerald-500/20 animate-voice-pulse" />
                  <div className="absolute inset-[-20px] rounded-full bg-emerald-500/10 animate-voice-pulse [animation-delay:0.4s]" />
                </>
              )}
              {status === "speaking" && (
                <>
                  <div className="absolute inset-[-8px] rounded-full bg-primary/20 animate-voice-pulse" />
                  <div className="absolute inset-[-20px] rounded-full bg-primary/10 animate-voice-pulse [animation-delay:0.4s]" />
                  <div className="absolute inset-[-32px] rounded-full bg-primary/5 animate-voice-pulse [animation-delay:0.8s]" />
                </>
              )}
              {status === "thinking" && (
                <div className="absolute inset-[-8px] rounded-full border-2 border-amber-500/30 animate-spin" style={{ animationDuration: "2s" }} />
              )}
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center relative z-10 shadow-2xl">
                <span className="text-3xl font-heading font-bold text-primary-foreground">
                  JSR
                </span>
              </div>
            </div>

            {/* Title */}
            <div className="text-center">
              <h2 className="text-xl font-heading font-semibold text-foreground">
                JSR AI {mode === "video" ? "Video" : "Voice"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {statusText[status]}
              </p>
              <p className="text-primary font-mono text-lg mt-1 tracking-wider">
                {formatTime(duration)}
              </p>
            </div>

            {/* Live transcript / AI response */}
            <div className="w-full max-w-sm min-h-[80px] max-h-[150px] overflow-y-auto">
              {transcript && status === "listening" && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-secondary/50 rounded-xl px-4 py-3 text-sm text-foreground text-center"
                >
                  🎙️ "{transcript}"
                </motion.div>
              )}
              {aiResponse && (status === "thinking" || status === "speaking") && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-primary/10 rounded-xl px-4 py-3 text-sm text-foreground text-center line-clamp-4"
                >
                  {aiResponse.slice(0, 200)}{aiResponse.length > 200 ? "..." : ""}
                </motion.div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-5">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isMuted
                    ? "bg-destructive/90 text-destructive-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>

              <button
                onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center text-destructive-foreground transition-colors shadow-xl"
              >
                <PhoneOff size={24} />
              </button>

              {mode === "video" && (
                <button
                  onClick={() => {
                    setIsCamOff(!isCamOff);
                    if (streamRef.current) {
                      streamRef.current.getVideoTracks().forEach((t) => {
                        t.enabled = isCamOff;
                      });
                    }
                  }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
                    isCamOff
                      ? "bg-destructive/90 text-destructive-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {isCamOff ? <VideoOff size={22} /> : <Video size={22} />}
                </button>
              )}
            </div>

            {!SpeechRecognition && (
              <p className="text-xs text-destructive text-center max-w-xs">
                ⚠️ Your browser doesn't support Speech Recognition. Please use Chrome or Edge for voice features.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
