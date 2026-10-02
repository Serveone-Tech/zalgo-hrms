import { useEffect, useRef, useState } from "react";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadFaceModels, detectSingleFaceDescriptor } from "@/lib/faceRecognition";

// Used only for enrollment (admin side) — captures one reference descriptor per employee.
// The kiosk never needs this component; it just downloads already-enrolled descriptors.
export function FaceEnrollCapture({ onCaptured }: { onCaptured: (descriptor: number[]) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadFaceModels().then(() => setReady(true)).catch(() => setError("Could not load face recognition models."));
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" } })
      .then((s) => { streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setError("Camera access denied. Please allow camera permission."));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = async () => {
    if (!videoRef.current) return;
    setBusy(true); setStatus(null);
    try {
      const descriptor = await detectSingleFaceDescriptor(videoRef.current);
      if (!descriptor) { setStatus("Make sure exactly one face is clearly visible, then try again."); return; }
      onCaptured(descriptor);
      setStatus("Captured!");
    } finally { setBusy(false); }
  };

  if (error) return <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2">{error}</p>;
  return (
    <div className="space-y-2 text-center">
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-[220px] rounded-md mx-auto bg-black aspect-square object-cover" />
      <Button type="button" size="sm" variant="secondary" className="w-full" disabled={!ready} loading={busy} onClick={capture}>
        <ScanFace size={14} /> {ready ? "Capture face" : "Loading models…"}
      </Button>
      {status && <p className="text-xs text-muted">{status}</p>}
    </div>
  );
}
