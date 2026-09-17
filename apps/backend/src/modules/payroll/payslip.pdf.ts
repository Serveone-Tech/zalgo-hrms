import PDFDocument from "pdfkit";
import type { Response } from "express";

type Item = { month: string; daysInMonth: number; payableDays: string; lopDays: string; earnings: { name: string; amount: number }[]; deductions: { name: string; amount: number }[]; gross: string; totalDeductions: string; net: string; attendance: Record<string, number>; bankSnapshot: Record<string, string | null> | null };
type Emp = { name: string; employeeCode: string; designation?: string | null; department?: string | null; branch?: string | null; joiningDate: Date; panNumber?: string | null; uanNumber?: string | null };
type Co = { name: string; address?: string | null; logoUrl?: string | null; gstNumber?: string | null };
const inr = (n: number | string) => "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
function words(n: number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"], b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const t = (x: number): string => x < 20 ? a[x] : x < 100 ? b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : "") : a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + t(x % 100) : "");
  n = Math.round(n); if (n === 0) return "Zero"; let s = "";
  if (n >= 1e7) { s += t(Math.floor(n / 1e7)) + " Crore "; n %= 1e7; } if (n >= 1e5) { s += t(Math.floor(n / 1e5)) + " Lakh "; n %= 1e5; } if (n >= 1000) { s += t(Math.floor(n / 1000)) + " Thousand "; n %= 1000; } if (n > 0) s += t(n);
  return s.trim() + " Rupees Only";
}
// Section 74: professional payslip
export function streamPayslip(res: Response, co: Co, emp: Emp, it: Item) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="payslip-${emp.employeeCode}-${it.month}.pdf"`);
  doc.pipe(res);
  const W = 515, L = 40; const teal = "#0E7C86", ink = "#16211F", muted = "#5B6B68", line = "#D9E0DE";
  doc.rect(L, 40, W, 60).fill(teal);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(16).text(co.name, L + 16, 52, { width: W - 32 });
  doc.font("Helvetica").fontSize(9).text(co.address ?? "", L + 16, 72, { width: W - 200 });
  doc.font("Helvetica-Bold").fontSize(12).text(`PAYSLIP — ${monthName(it.month).toUpperCase()}`, L + 16, 76, { width: W - 32, align: "right" });
  doc.fillColor(ink);
  const kv = (x: number, y: number, k: string, v: string) => { doc.font("Helvetica").fontSize(8).fillColor(muted).text(k, x, y); doc.font("Helvetica-Bold").fontSize(9.5).fillColor(ink).text(v || "—", x, y + 10, { width: 160 }); };
  let y = 116;
  kv(L, y, "Employee", emp.name); kv(L + 175, y, "Employee code", emp.employeeCode); kv(L + 350, y, "Designation", emp.designation ?? ""); y += 32;
  kv(L, y, "Department", emp.department ?? ""); kv(L + 175, y, "Branch", emp.branch ?? ""); kv(L + 350, y, "Date of joining", emp.joiningDate.toLocaleDateString("en-IN")); y += 32;
  kv(L, y, "PAN", emp.panNumber ?? ""); kv(L + 175, y, "UAN", emp.uanNumber ?? ""); kv(L + 350, y, "Bank A/c", it.bankSnapshot?.accountNumber ? `${it.bankSnapshot.bankName ?? ""} ${it.bankSnapshot.accountNumber}` : ""); y += 34;
  // attendance strip
  doc.rect(L, y, W, 26).fill("#F1F5F4"); doc.fillColor(ink).font("Helvetica").fontSize(8.5);
  const a = it.attendance; const strip = [`Days: ${it.daysInMonth}`, `Payable: ${Number(it.payableDays)}`, `LOP: ${Number(it.lopDays)}`, `Present: ${a.present}`, `Paid leave: ${a.paidLeave}`, `Holidays/WO: ${a.holidays + a.weekOffs}`, `Absent: ${a.absent}`];
  strip.forEach((s, i) => doc.text(s, L + 10 + i * 72, y + 9, { width: 72 })); y += 38;
  // two columns
  const colW = (W - 10) / 2; const rx = L + colW + 10;
  const header = (x: number, t: string) => { doc.rect(x, y, colW, 18).fill(teal); doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text(t, x + 8, y + 5); doc.text("Amount", x + colW - 88, y + 5, { width: 80, align: "right" }); doc.fillColor(ink); };
  header(L, "EARNINGS"); header(rx, "DEDUCTIONS"); y += 18;
  const rows = Math.max(it.earnings.length, it.deductions.length, 6);
  for (let i = 0; i < rows; i++) {
    const e = it.earnings[i], d = it.deductions[i]; doc.font("Helvetica").fontSize(9);
    if (e) { doc.text(e.name, L + 8, y + 5, { width: colW - 100 }); doc.text(Number(e.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }), L + colW - 88, y + 5, { width: 80, align: "right" }); }
    if (d) { doc.text(d.name, rx + 8, y + 5, { width: colW - 100 }); doc.text(Number(d.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }), rx + colW - 88, y + 5, { width: 80, align: "right" }); }
    doc.moveTo(L, y + 18).lineTo(L + W, y + 18).strokeColor(line).lineWidth(0.5).stroke(); y += 18;
  }
  doc.rect(L, y, W, 20).fill("#F1F5F4"); doc.fillColor(ink).font("Helvetica-Bold").fontSize(9.5);
  doc.text("Gross earnings", L + 8, y + 6); doc.text(inr(it.gross), L + colW - 118, y + 6, { width: 110, align: "right" });
  doc.text("Total deductions", rx + 8, y + 6); doc.text(inr(it.totalDeductions), rx + colW - 118, y + 6, { width: 110, align: "right" }); y += 34;
  doc.rect(L, y, W, 44).fill(teal); doc.fillColor("#fff").font("Helvetica").fontSize(9).text("NET PAY", L + 14, y + 8);
  doc.font("Helvetica-Bold").fontSize(18).text(inr(it.net), L + 14, y + 19);
  doc.font("Helvetica").fontSize(8.5).text(words(Number(it.net)), L + 200, y + 18, { width: W - 214, align: "right" }); y += 60;
  doc.fillColor(muted).font("Helvetica").fontSize(7.5).text("This is a computer-generated payslip and does not require a signature. Generated by Zalgo HRMS.", L, y, { width: W, align: "center" });
  doc.end();
}
