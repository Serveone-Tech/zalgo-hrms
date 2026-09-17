import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const inr = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const daysLeft = (d?: string | Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : 0);
