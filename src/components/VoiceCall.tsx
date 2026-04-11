import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VoiceCallProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VoiceCall({ isOpen, onClose }: VoiceCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isOpen) {
      setDuration(0);
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
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="flex flex-col items-center gap-8"
          >
            {/* Avatar with pulse */}
            <div className="relative">
              {isListening && !isMuted && (
                <>
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-voice-pulse" />
                  <div className="absolute inset-[-12px] rounded-full bg-primary/10 animate-voice-pulse [animation-delay:0.5s]" />
                </>
              )}
              <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center relative z-10">
                <span className="text-3xl font-heading font-bold text-primary-foreground">
                  JSR
                </span>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-xl font-heading font-semibold text-foreground">
                JSR AI Voice
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {isListening && !isMuted ? "Listening..." : isMuted ? "Muted" : "Connected"}
              </p>
              <p className="text-primary font-mono text-lg mt-2">
                {formatTime(duration)}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isMuted
                    ? "bg-destructive/20 text-destructive"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center text-destructive-foreground transition-colors"
              >
                <PhoneOff size={22} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground max-w-xs text-center">
              Voice call feature will be fully functional when connected to Lovable Cloud.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
