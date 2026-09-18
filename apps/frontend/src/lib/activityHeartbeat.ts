import { useEffect, useRef } from "react";
import { api } from "./api";

const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

// Pings the server whenever real user activity happens, throttled to ~1/20s — never records
// what the activity was (no keys, no content), only that some occurred. The server (not this
// timer) decides when to auto-pause, so it can't be fooled by leaving the tab open.
export function useActivityHeartbeat(enabled: boolean) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      const now = Date.now();
      if (now - last.current < 20000) return;
      last.current = now;
      api.post("/attendance/self/heartbeat").catch(() => {});
    };
    ping();
    EVENTS.forEach((e) => window.addEventListener(e, ping, { passive: true }));
    return () => EVENTS.forEach((e) => window.removeEventListener(e, ping));
  }, [enabled]);
}
