import nodemailer from "nodemailer";
import type { notificationSettings } from "../../db/schema.js";
type Settings = typeof notificationSettings.$inferSelect;

// Section 94: channels enable/disable per company. Har channel ek adapter.
export async function sendEmail(s: Settings["email"], to: string, subject: string, text: string) {
  if (!s.enabled || !s.host || !to) return "skipped" as const;
  const t = nodemailer.createTransport({ host: s.host, port: s.port ?? 587, secure: !!s.secure, auth: s.user ? { user: s.user, pass: s.pass } : undefined });
  await t.sendMail({ from: s.from ?? s.user, to, subject, text, html: `<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</div>` });
  return "sent" as const;
}
export async function sendSms(s: Settings["sms"], mobile: string, text: string) {
  if (!s.enabled || !mobile) return "skipped" as const;
  if (s.provider === "msg91" && s.authKey) {
    const r = await fetch("https://control.msg91.com/api/v5/flow/", { method: "POST", headers: { authkey: s.authKey, "content-type": "application/json" }, body: JSON.stringify({ template_id: s.templateId, sender: s.senderId, mobiles: mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1"), message: text }) });
    if (!r.ok) throw new Error(`MSG91 ${r.status}`); return "sent" as const;
  }
  throw new Error("SMS provider not configured");
}
export async function sendWhatsApp(s: Settings["whatsapp"], mobile: string, text: string) {
  if (!s.enabled || !mobile) return "skipped" as const;
  const m = mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");
  if (s.provider === "interakt" && s.apiKey) {
    const r = await fetch("https://api.interakt.ai/v1/public/message/", { method: "POST", headers: { Authorization: `Basic ${s.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ countryCode: "+91", phoneNumber: m.slice(-10), type: "Text", data: { message: text } }) });
    if (!r.ok) throw new Error(`Interakt ${r.status}`); return "sent" as const;
  }
  if (s.provider === "msg91" && s.apiKey) {
    const r = await fetch("https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/", { method: "POST", headers: { authkey: s.apiKey, "content-type": "application/json" }, body: JSON.stringify({ integrated_number: s.namespace, recipient_number: m, content_type: "text", text }) });
    if (!r.ok) throw new Error(`MSG91 WA ${r.status}`); return "sent" as const;
  }
  if (s.provider === "generic" && s.endpoint) { const r = await fetch(s.endpoint, { method: "POST", headers: { "content-type": "application/json", ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}) }, body: JSON.stringify({ to: m, text }) }); if (!r.ok) throw new Error(`Webhook ${r.status}`); return "sent" as const; }
  throw new Error("WhatsApp provider not configured");
}
