import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useGet, useAction } from "@/lib/queries";
import { cn } from "@/lib/utils";

type N = { id: string; type: string; priority: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
const dot: Record<string, string> = { info: "bg-brand", success: "bg-good", warning: "bg-warn", critical: "bg-danger" };
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
export function NotificationBell() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const { data } = useGet<{ rows: N[]; unread: number }>(["notifs"], "/notifications");
  const act = useAction([["notifs"]]);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const unread = data?.data?.unread ?? 0;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(!open); if (!open && unread) act.mutate({ url: "/notifications/read", body: {} }); }} className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-surface-2 text-ink" aria-label="Notifications"><Bell size={18} />{unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center px-1">{unread > 99 ? "99+" : unread}</span>}</button>
      {open && <div className="absolute right-0 mt-2 w-[360px] max-h-[70vh] overflow-y-auto card shadow-xl z-50"><div className="px-4 py-3 border-b border-line font-bold text-sm">Notifications</div>
        {!data?.data?.rows.length ? <p className="p-4 text-sm text-muted">You're all caught up.</p> : data.data.rows.map((n) => { const inner = <div className={cn("px-4 py-3 border-b border-line/60 flex gap-3", !n.readAt && "bg-brand-soft/30")}><span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dot[n.priority] ?? dot.info)} /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{n.title}</div>{n.body && <div className="text-xs text-muted line-clamp-2">{n.body}</div>}</div><span className="text-[11px] text-muted whitespace-nowrap">{ago(n.createdAt)}</span></div>; return n.link ? <Link key={n.id} to={n.link} onClick={() => setOpen(false)} className="block hover:bg-surface-2/60">{inner}</Link> : <div key={n.id}>{inner}</div>; })}</div>}
    </div>
  );
}
