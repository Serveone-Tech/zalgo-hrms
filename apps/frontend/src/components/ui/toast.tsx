import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "success" | "error"; text: string };
const Ctx = createContext<{ toast: (text: string, kind?: Toast["kind"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cn("card flex items-start gap-2.5 px-3.5 py-3 text-sm shadow-lg min-w-[260px] max-w-sm", t.kind === "error" ? "border-danger/40" : "border-good/40")}>
            {t.kind === "error" ? <AlertCircle size={17} className="text-danger shrink-0 mt-0.5" /> : <CheckCircle2 size={17} className="text-good shrink-0 mt-0.5" />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-muted hover:text-ink"><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => { const c = useContext(Ctx); if (!c) throw new Error("useToast outside provider"); return c; };
