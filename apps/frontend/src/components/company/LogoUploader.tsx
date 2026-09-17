import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { api, API_ORIGIN, errMsg } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { ApiResponse } from "@hrms/shared-types";

export function LogoUploader({ logoUrl, uploadUrl, onUploaded }: { logoUrl: string | null; uploadUrl: string; onUploaded: (logoUrl: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const pick = () => inputRef.current?.click();
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    const form = new FormData(); form.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post<ApiResponse<{ logoUrl: string }>>(uploadUrl, form, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data.data!.logoUrl);
      toast("Logo uploaded");
    } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  };
  const src = preview ?? (logoUrl ? `${API_ORIGIN}${logoUrl}` : null);

  return (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 rounded-lg border border-line bg-surface-2 grid place-items-center overflow-hidden shrink-0">
        {src ? <img src={src} alt="Company logo" className="h-full w-full object-contain" /> : <ImagePlus size={22} className="text-muted" />}
      </div>
      <div>
        <button type="button" onClick={pick} disabled={busy} className="text-sm font-semibold text-brand hover:underline disabled:opacity-50">
          {busy ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
        </button>
        <p className="text-xs text-muted mt-0.5">PNG, JPG, WEBP or SVG — max 2MB</p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}
