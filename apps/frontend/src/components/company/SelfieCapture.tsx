import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Live camera preview + single-frame capture. Nothing is uploaded here — the parent gets a
// Blob and decides when/where to send it (attendance check-in only fires after capture).
export function SelfieCapture({ onCaptured }: { onCaptured: (blob: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user" } })
      .then((s) => { streamRef.current = s; if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => setError("Camera access denied. Please allow camera permission and reload."));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const capture = () => {
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) { setPreview(canvas.toDataURL("image/jpeg", 0.85)); onCaptured(blob); } }, "image/jpeg", 0.85);
  };
  const retake = () => { setPreview(null); onCaptured(null); };

  if (error) return <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2">{error}</p>;
  return (
    <div className="space-y-2">
      {preview
        ? <img src={preview} alt="Selfie preview" className="w-full max-w-[220px] rounded-md mx-auto" />
        : <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-[220px] rounded-md mx-auto bg-black aspect-square object-cover" />}
      {preview
        ? <Button type="button" size="sm" variant="secondary" className="w-full" onClick={retake}><RotateCcw size={14} /> Retake</Button>
        : <Button type="button" size="sm" variant="secondary" className="w-full" onClick={capture}><Camera size={14} /> Capture selfie</Button>}
    </div>
  );
}
