"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { MicrophoneIcon as Mic, MicrophoneSlashIcon as MicOff } from "@phosphor-icons/react/ssr";

// Web Speech API (Chrome, Edge, Safari). Not in every browser, so the mic
// button hides itself when unsupported.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export function MicButton({ onText, onFinal }: { onText: (t: string) => void; onFinal: (t: string) => void }) {
  const supported = useSyncExternalStore(noop, () => !!getRecognition(), () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition()!;
    const r = new R();
    r.lang = navigator.language || "en-PH";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      onText(text);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone access was blocked" : null);
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) onFinal(finalText.trim());
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={`icon-btn shrink-0 ${listening ? "bg-surface text-bad" : ""}`}
        aria-label={listening ? "Stop listening" : "Speak a transaction"}
        aria-pressed={listening}
        title={error ?? (listening ? "Listening…" : "Speak a transaction")}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </>
  );
}
