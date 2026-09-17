import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/ui/toast";
import { API_URL } from "./api";

let socket: Socket | null = null;
const events: Record<string, (p: any) => string> = {
  "branch:requested": (p) => `New branch request: ${p.name}`,
  "branch:approved": (p) => `Branch approved: ${p.name}`,
  "branch:rejected": (p) => `Branch rejected: ${p.name} — ${p.reason}`,
  "subscription:expiring": (p) => `Subscription expires in ${p.daysLeft} day(s)`,
  "subscription:expired": () => "Subscription expired",
  "subscription:past_due": () => "A subscription is past due",
  "attendance:new": () => "New attendance punch",
  "leave:requested": (p) => `New leave request (${p.days} day${p.days === 1 ? "" : "s"})`,
  "leave:approved": () => "Leave approved",
  "leave:rejected": (p) => `Leave rejected: ${p.reason}`,
  "expense:submitted": (p) => `New expense claim ₹${p.amount}`,
  "expense:updated": (p) => `Expense ${p.status}${p.reason ? ": " + p.reason : ""}`,
  "ticket:created": (p) => `Ticket #${p.number}: ${p.subject}`,
  "announcement:new": (p) => `Announcement: ${p.title}`,
  "interview:scheduled": (p) => `Interview scheduled: ${p.candidate}`,
  "notification:new": (p) => p.title,
  "payroll:paid": (p) => `Salary for ${p.month} has been paid — payslip available`,
  "device:online": (p) => `${p.name} is online`,
  "device:offline": (p) => `${p.name} went ${p.status}`,
};

// Section 101: real-time events → toast + query refresh
export function useRealtime() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient(); const { toast } = useToast();
  useEffect(() => {
    if (!token) return;
    socket = io(API_URL.replace(/\/api\/v1$/, ""), { auth: { token }, transports: ["websocket"] });
    const me = useAuth.getState().user?.id;
    for (const [ev, fmt] of Object.entries(events)) socket.on(ev, (p) => { if (ev === "notification:new" && !(p.userIds ?? []).includes(me)) return; if (ev === "payroll:paid" || ev !== "notification:new") { /* show for everyone in room */ } toast(fmt(p), ev.includes("rejected") || ev.includes("expired") || p?.priority === "critical" ? "error" : "success"); qc.invalidateQueries(); });
    return () => { socket?.disconnect(); socket = null; };
  }, [token, qc, toast]);
}
