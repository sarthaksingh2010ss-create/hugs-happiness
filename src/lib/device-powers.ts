// Native-like device powers via Web APIs. All in-browser, no user setup.

export const DevicePowers = {
  // --- Speech synthesis (TTS) ---
  speak(text: string, opts: { lang?: string; rate?: number; pitch?: number } = {}) {
    if (!("speechSynthesis" in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? "hi-IN";
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  },
  stopSpeaking() {
    window.speechSynthesis?.cancel();
  },

  // --- Speech recognition (STT) ---
  listen(onResult: (text: string, isFinal: boolean) => void, opts: { lang?: string } = {}) {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = opts.lang ?? "hi-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let txt = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        txt += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      onResult(txt, final);
    };
    rec.start();
    return () => rec.stop();
  },

  // --- Camera / Mic ---
  async camera(video = true, audio = true) {
    return navigator.mediaDevices.getUserMedia({ video, audio });
  },
  async capturePhoto(): Promise<Blob | null> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());
    return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  },

  // --- Geolocation ---
  location() {
    return new Promise<GeolocationPosition>((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("no geolocation"));
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true });
    });
  },

  // --- Notifications ---
  async notify(title: string, body?: string) {
    if (!("Notification" in window)) return false;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    new Notification(title, { body, icon: "/icon-192.png" });
    return true;
  },

  // --- Vibration ---
  vibrate(pattern: number | number[] = 200) {
    return navigator.vibrate?.(pattern) ?? false;
  },

  // --- Clipboard ---
  async copy(text: string) {
    await navigator.clipboard.writeText(text);
  },
  async paste() {
    return navigator.clipboard.readText();
  },

  // --- Share ---
  async share(data: ShareData) {
    if (navigator.share) return navigator.share(data);
    return false;
  },

  // --- Files ---
  async pickFile(accept = "*/*", multiple = false): Promise<File[]> {
    return new Promise((res) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.multiple = multiple;
      input.onchange = () => res(Array.from(input.files ?? []));
      input.click();
    });
  },
  downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // --- Wake lock (keep screen on) ---
  async keepAwake() {
    try {
      return await (navigator as any).wakeLock?.request("screen");
    } catch {
      return null;
    }
  },

  // --- Battery ---
  async battery() {
    return (navigator as any).getBattery?.();
  },

  // --- Network ---
  network() {
    const c: any = (navigator as any).connection;
    return c ? { type: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData } : null;
  },

  // --- Fullscreen ---
  fullscreen(el: Element = document.documentElement) {
    return (el as any).requestFullscreen?.();
  },

  // --- Device orientation / motion ---
  onMotion(cb: (e: DeviceMotionEvent) => void) {
    window.addEventListener("devicemotion", cb);
    return () => window.removeEventListener("devicemotion", cb);
  },
};

// Expose globally so extension / AI tools can invoke.
if (typeof window !== "undefined") (window as any).JSR = DevicePowers;
