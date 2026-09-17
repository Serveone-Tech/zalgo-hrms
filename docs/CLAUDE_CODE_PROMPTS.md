# Claude Code Prompts — Phase 2 se Phase 9

Har phase ke liye Claude Code mein yeh prompt paste karo (project root se `claude` chalao).
Pehle `CLAUDE.md` (root) padh liya jayega — usme codebase ke rules hain.

---

## Phase 2 — DONE (add-ons, invoices, expiry job, realtime events already in codebase)

## Phase 3 — DONE (employees, departments, designations, documents, org tree, transfers, scope)

## Phase 4 — DONE (shifts, holidays, attendance processor, punches, regularise, jobs)

## Phase 5 — DONE (devices, agent API, ADMS push receiver, ZKTeco TCP adapter, offline queue, live status)

## Phase 6 — DONE (leave types, balances, accrual, workflow, calendar, attendance hook)

## Phase 7 — DONE (components, statutory settings, salary structures, advances, runs, approval, bank sheet, PDF payslips)

## Phase 8 — DONE (expenses, recruitment, performance, help desk, announcements, calendar)

## Phase 9 — DONE (notifications, automation engine, reports/export, AI assistant, job queue)

---

# All 9 phases are implemented. Prompts for further work

```
Read CLAUDE.md. Swap the in-process queue for BullMQ: implement src/queue/bull.ts with the same registerJob/enqueue interface using bullmq + ioredis when REDIS_URL is set; keep the in-process fallback.
```
```
Read CLAUDE.md. Add S3/Cloudinary storage adapter for employee documents and expense receipts (multer → adapter interface in src/common/storage.ts); keep local disk as default.
```
```
Read CLAUDE.md. Add mobile-friendly selfie attendance: frontend camera capture → upload via /attendance/punch with selfieUrl; store in storage adapter; show thumbnail in attendance detail.
```
```
Read CLAUDE.md. Add Razorpay subscription payments for companies: payment link on invoices, webhook to mark invoice paid and activate subscription.
```
```
Read CLAUDE.md. Add vitest test suites for payroll.engine.ts, attendance processor.ts and leave.service.ts covering the SRS edge cases (sections 136–138).
```
