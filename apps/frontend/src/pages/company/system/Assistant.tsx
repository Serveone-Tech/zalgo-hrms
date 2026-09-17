import { useState, useRef, useEffect } from "react";
import { Sparkles, Send } from "lucide-react";
import { useGet } from "@/lib/queries";
import { api, errMsg } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGEST = ["Mere kitne leave bache hain?", "Is month meri attendance kaisi hai?", "Mera last payslip ka net pay kya tha?", "Which department has the highest absenteeism this month?", "Agle holidays kaunse hain?"];
export default function Assistant() {
  const status = useGet<{ configured: boolean; model: string }>(["ai-status"], "/ai/status");
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return; setQ(""); setBusy(true);
    const hist = msgs.slice(-8); setMsgs((m) => [...m, { role: "user", content: question }]);
    try { const { data } = await api.post("/ai/ask", { question, history: hist }); setMsgs((m) => [...m, { role: "assistant", content: data.data.answer }]); }
    catch (e) { setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${errMsg(e)}` }]); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="HR assistant" sub="Ask about your leaves, attendance, payslips, holidays — or HR analytics if you have report access." />
      {status.data?.data && !status.data.data.configured && <Empty text="AI assistant is not configured. Add ANTHROPIC_API_KEY to apps/backend/.env and restart the backend." />}
      <div className="card flex flex-col h-[65vh]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{!msgs.length && <div className="text-center py-8"><Sparkles className="mx-auto text-brand" size={28} /><p className="text-sm text-muted mt-2">Try one of these:</p><div className="flex flex-wrap justify-center gap-2 mt-3">{SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand">{s}</button>)}</div></div>}
          {msgs.map((m, i) => <div key={i} className={cn("max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap", m.role === "user" ? "ml-auto bg-brand text-brand-ink" : "bg-surface-2")}>{m.content}</div>)}{busy && <div className="bg-surface-2 rounded-lg px-3.5 py-2.5 text-sm text-muted w-fit">Thinking…</div>}<div ref={end} /></div>
        <form className="border-t border-line p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input className="field flex-1" placeholder="Ask in English or Hinglish…" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} /><Button type="submit" loading={busy} disabled={!q.trim()}><Send size={15} /></Button></form>
      </div>
      <p className="text-xs text-muted mt-2">Answers use only your own records (and company-level aggregates for HR). Model: {status.data?.data?.model}</p>
    </>
  );
}
