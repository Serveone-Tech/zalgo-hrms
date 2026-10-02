import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ScanFace } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadFaceModels, detectSingleFaceDescriptor, findBestMatch } from "@/lib/faceRecognition";
import type { ApiResponse } from "@hrms/shared-types";

type Enrolled = { id: string; name: string; employeeCode: string; descriptor: number[] };
const SCAN_INTERVAL_MS = 1200;
const COOLDOWN_MS = 30000; // don't re-punch the same person for 30s (they're still walking past)

export default function Kiosk() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Enrolled[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "muted" | "danger" } | null>(null);
  const lastPunch = useRef<Map<string, number>>(new Map());
  const busyRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        await loadFaceModels();
        const { data } = await api.get<ApiResponse<Enrolled[]>>("/employees/face-descriptors");
        setEnrolled(data.data ?? []);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      } catch (e) { setError(errMsg(e)); }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(async () => {
      if (busyRef.current || !videoRef.current || !enrolled.length) return;
      busyRef.current = true;
      try {
        const descriptor = await detectSingleFaceDescriptor(videoRef.current);
        if (!descriptor) return;
        const match = findBestMatch(descriptor, enrolled);
        if (!match) { setMessage({ text: "Face not recognized — ask HR to enroll you.", tone: "danger" }); return; }
        const last = lastPunch.current.get(match.id) ?? 0;
        if (Date.now() - last < COOLDOWN_MS) return;
        lastPunch.current.set(match.id, Date.now());
        const { data } = await api.post<ApiResponse<{ name: string }>>("/attendance/kiosk/punch", { employeeId: match.id, confidence: match.confidence });
        setMessage({ text: `✅ ${data.data?.name ?? match.name} — punched`, tone: "good" });
      } catch (e) { setMessage({ text: errMsg(e), tone: "danger" }); } finally { busyRef.current = false; }
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ready, enrolled]);

  return (
    <div className="min-h-screen bg-side text-side-ink flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo force="dark" className="self-start" />
        <div className="flex items-center gap-3"><ThemeToggle /><Link to="/app" className="text-sm text-side-ink/70 hover:text-side-ink inline-flex items-center gap-1"><ArrowLeft size={14} /> Exit kiosk</Link></div>
      </header>
      <div className="flex-1 grid place-items-center p-6">
        <div className="text-center max-w-sm w-full">
          <div className="rounded-2xl overflow-hidden bg-black aspect-square mx-auto max-w-[320px] relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {!ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-side-ink/70">Loading camera & models…</div>}
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold"><ScanFace size={16} /> {enrolled.length} face{enrolled.length === 1 ? "" : "s"} enrolled</div>
          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
          {message && <p className={`mt-4 text-lg font-bold ${message.tone === "good" ? "text-good" : message.tone === "danger" ? "text-danger" : "text-side-ink/70"}`}>{message.text}</p>}
          {!message && ready && <p className="mt-4 text-side-ink/60">Look at the camera to check in or out.</p>}
        </div>
      </div>
    </div>
  );
}
