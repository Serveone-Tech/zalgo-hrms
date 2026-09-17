import { useState } from "react";
import { useGet, useAction } from "@/lib/queries";
import { Loading, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export function NotificationSettings() {
  const { data, isLoading } = useGet<any>(["notif-settings"], "/notifications/company/settings");
  const act = useAction([["notif-settings"]]);
  const [s, setS] = useState<any>(null);
  if (isLoading) return <Loading />;
  const v = s ?? data?.data; if (!v) return null;
  const set = (path: string, val: any) => { const n = JSON.parse(JSON.stringify(v)); const p = path.split("."); let o = n; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] ??= {}; o[p[p.length - 1]] = val; setS(n); };
  const get = (path: string) => path.split(".").reduce((o, k) => o?.[k], v);
  const T = (path: string, label: string, type = "text") => <Field label={label}><input className="field" type={type} value={get(path) ?? ""} onChange={(e) => set(path, type === "number" ? Number(e.target.value) : e.target.value)} /></Field>;
  const B = (path: string, label: string) => <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!get(path)} onChange={(e) => set(path, e.target.checked)} />{label}</label>;
  const cat = v.catalogue as Record<string, { label: string; email: boolean; sms: boolean; whatsapp: boolean }>;
  const ev = (k: string, ch: string) => v.events?.[k]?.[ch] ?? (ch === "inApp" ? true : cat[k][ch as "email"]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 space-y-3">{B("email.enabled", "Email (SMTP)")}{T("email.host", "SMTP host")}<div className="grid grid-cols-2 gap-3">{T("email.port", "Port", "number")}<Field label="TLS"><label className="flex items-center gap-2 h-10 text-sm"><input type="checkbox" checked={!!get("email.secure")} onChange={(e) => set("email.secure", e.target.checked)} />SSL/TLS (465)</label></Field></div>{T("email.user", "Username")}{T("email.pass", "Password", "password")}{T("email.from", "From address")}<Button size="sm" variant="secondary" loading={act.isPending} onClick={() => act.mutate({ url: "/notifications/company/test", body: { channel: "email" } })}>Send test email</Button></div>
        <div className="card p-4 space-y-3">{B("sms.enabled", "SMS")}<Field label="Provider"><select className="field" value={get("sms.provider") ?? "msg91"} onChange={(e) => set("sms.provider", e.target.value)}><option value="msg91">MSG91</option></select></Field>{T("sms.authKey", "Auth key", "password")}{T("sms.senderId", "Sender ID (6 chars)")}{T("sms.templateId", "DLT template ID")}<p className="text-xs text-muted">Employee ka mobile employee profile se liya jata hai.</p></div>
        <div className="card p-4 space-y-3">{B("whatsapp.enabled", "WhatsApp")}<Field label="Provider"><select className="field" value={get("whatsapp.provider") ?? "interakt"} onChange={(e) => set("whatsapp.provider", e.target.value)}><option value="interakt">Interakt</option><option value="msg91">MSG91 WhatsApp</option><option value="generic">Generic webhook (POST {"{to,text}"})</option></select></Field>{T("whatsapp.apiKey", "API key", "password")}{get("whatsapp.provider") === "msg91" && T("whatsapp.namespace", "Integrated number")}{get("whatsapp.provider") === "generic" && T("whatsapp.endpoint", "Webhook URL")}</div>
      </div>
      <div className="card overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Event</th><th className="th text-center">In-app</th><th className="th text-center">Email</th><th className="th text-center">SMS</th><th className="th text-center">WhatsApp</th></tr></thead>
        <tbody>{Object.entries(cat).map(([k, c]) => <tr key={k}><td className="td">{c.label}<div className="text-[11px] font-mono text-muted">{k}</div></td>{["inApp", "email", "sms", "whatsapp"].map((ch) => <td key={ch} className="td text-center"><input type="checkbox" checked={ev(k, ch)} onChange={(e) => set(`events.${k}`, { inApp: ev(k, "inApp"), email: ev(k, "email"), sms: ev(k, "sms"), whatsapp: ev(k, "whatsapp"), [ch]: e.target.checked })} /></td>)}</tr>)}</tbody></table></div>
      <div className="flex justify-end gap-2"><Button variant="secondary" loading={act.isPending} onClick={() => act.mutate({ url: "/notifications/company/test", body: { channel: "inApp" } })}>Test in-app</Button><Button loading={act.isPending} onClick={() => { const { catalogue, id, companyId, createdAt, updatedAt, ...body } = v; const events: any = {}; for (const k of Object.keys(cat)) events[k] = { inApp: ev(k, "inApp"), email: ev(k, "email"), sms: ev(k, "sms"), whatsapp: ev(k, "whatsapp") }; act.mutate({ method: "put", url: "/notifications/company/settings", body: { ...body, events } }, { onSuccess: () => setS(null) }); }}>Save notification settings</Button></div>
    </div>
  );
}
