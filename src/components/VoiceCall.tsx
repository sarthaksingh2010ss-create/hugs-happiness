import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceCallProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "voice" | "video";
}

export default function VoiceCall({ isOpen, onClose, mode }: VoiceCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isOpen) {
      setDuration(0);
      setIsMuted(false);
      setIsCamOff(false);
      setIsListening(true);
      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsListening(false);
    };
  }, [isOpen]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleEnd = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsListening(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/98 backdrop-blur-2xl flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="flex flex-col items-center gap-8"
          >
            {/* Avatar with Google-style pulse rings */}
            <div className="relative">
              {isListening && !isMuted && (
                <>
                  <div className="absolute inset-[-8px] rounded-full bg-primary/15 animate-voice-pulse" />
                  <div className="absolute inset-[-20px] rounded-full bg-primary/8 animate-voice-pulse [animation-delay:0.4s]" />
                  <div className="absolute inset-[-32px] rounded-full bg-primary/4 animate-voice-pulse [animation-delay:0.8s]" />
                </>
              )}
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center relative z-10 shadow-2xl">
                {mode === "video" ? (
                  <Video size={40} className="text-primary-foreground" />
                ) : (
                  <span className="text-4xl font-heading font-bold text-primary-foreground">
                    JSR
                  </span>
                )}
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-heading font-semibold text-foreground">
                JSR AI {mode === "video" ? "Video" : "Voice"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1.5">
                {isListening && !isMuted ? "Listening..." : isMuted ? "Muted" : "Connected"}
              </p>
              <p className="text-primary font-mono text-xl mt-3 tracking-wider">
                {formatTime(duration)}
              </p>
            </div>

            {/* Google-style round control buttons */}
            <div className="flex items-center gap-5">
              {/* Mute */}
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

              {/* End call */}
              <button
                onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center text-destructive-foreground transition-colors shadow-xl"
              >
                <PhoneOff size={24} />
              </button>

              {/* Camera toggle (video mode) */}
              {mode === "video" && (
                <button
                  onClick={() => setIsCamOff(!isCamOff)}
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

            <p className="text-xs text-muted-foreground max-w-xs text-center mt-2">
              {mode === "video" ? "Video" : "Voice"} call demo • Connect to Lovable Cloud for full AI voice
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
