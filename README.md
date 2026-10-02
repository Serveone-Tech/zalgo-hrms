# Zalgo HRMS SaaS — Complete (Phase 1–9)

Multi-tenant HRMS platform for **Zalgo Infotech Private Limited**. SRS ke saare 9 phases is codebase mein hain:

| Phase | Module | Status |
|---|---|---|
| 1 | Monorepo, auth, Super Admin, companies, tenant isolation, roles/permissions, plans, module access | ✅ |
| 2 | Branch requests + approval, dynamic pricing, add-ons, invoices, subscription expiry | ✅ |
| 3 | Employees, departments, designations, documents (signed URLs), org tree, transfers, data scope | ✅ |
| 4 | Shifts, holidays, attendance engine (multi-punch, night shift, rules), web/GPS/selfie punch, regularise | ✅ |
| 5 | Devices, hardware agent, ADMS push + ZKTeco TCP adapters, offline queue, live status | ✅ |
| 6 | Leave types, balances, accrual/carry-forward, manager→HR workflow, calendar, comp-off | ✅ |
| 7 | Salary components, PF/ESI/PT/TDS, salary structures, advances, payroll runs, PDF payslips, bank sheet | ✅ |
| 8 | Expenses, Recruitment/ATS + offer letters, Performance (goals, appraisals), Help desk, Announcements, Calendar | ✅ |
| 9 | Notifications (in-app/email/SMS/WhatsApp), Automation rule engine, Reports (Excel/CSV/PDF), AI HR assistant, job queue | ✅ |

---

## 1. Requirements

- **Node.js 20+** (https://nodejs.org) — `node -v` se check karo
- **pnpm** — `npm i -g pnpm`
- **Neon Postgres** account (free) — https://neon.tech
- Optional: SMTP (email), MSG91/Interakt (SMS/WhatsApp), Anthropic API key (AI assistant)

## 2. Pehli baar setup (10 minute)

```bash
# 1. Zip unzip karo, folder mein jao
cd hrms-saas

# 2. Dependencies
pnpm install

# 3. Env files
cp .env.example apps/backend/.env
cp .env.example apps/frontend/.env
cp .env.example apps/hardware-agent/.env
```

`apps/backend/.env` mein yeh 3 cheezein zaroor badlo:

```env
DATABASE_URL=postgresql://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/hrms?sslmode=require
JWT_ACCESS_SECRET=koi-bhi-32-character-random-string-yahan
JWT_REFRESH_SECRET=doosri-32-character-random-string-yahan
SUPER_ADMIN_EMAIL=admin@zalgoinfotech.com
SUPER_ADMIN_PASSWORD=Admin@12345
```

> **Neon connection string kahan se?** neon.tech → apna project → **Connect** → "Connection string" copy karo (Pooled connection theek hai).

```bash
# 4. Database tables banao (60+ tables, ek command)
pnpm db:push

# 5. Super Admin + 4 plans + 4 add-ons seed karo
pnpm db:seed

# 6. Poora system start karo
pnpm dev
```

| App | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api/v1 (health: http://localhost:5000/health) |
| Hardware Agent | http://localhost:5001 (agent key ke bina exit hoga — normal hai, Section 7 dekho) |

## 3. Pehla login aur company setup

1. http://localhost:3000 → `admin@zalgoinfotech.com` / `Admin@12345` (**Super Admin**)
2. **Companies → New company** — company details, plan (Enterprise = sab modules), company admin ka email/password, head office
3. Logout → company admin se login → yeh sab order mein:
   - **Shifts & holidays** → General shift banao, **Default** tick karo, week-off Sunday
   - **Departments / Designations** banao
   - **Leave → Leave types → "Create Indian defaults"** (CL/SL/EL/LWP/ML/PL/CO/WFH)
   - **Payroll → Components → "Create Indian defaults"**, phir **Statutory settings** check karo (PF/ESI/PT)
   - **Expenses → Categories → "Create defaults"**
   - **Employees → Add employee** (self-service login ke saath) → profile mein **Salary** set karo
   - **Settings → Notifications** mein SMTP/SMS/WhatsApp (optional)

Ab employee login se: My attendance (check in), Leave apply, Expenses, Help desk, Payslips, HR assistant.

## 4. Logo (light + dark mode)

Sirf 3 files replace karo:

```
apps/frontend/public/logo-light.svg   → light mode ka logo
apps/frontend/public/logo-dark.svg    → dark mode ka logo
apps/frontend/public/logo-mark.svg    → chhota icon / favicon
```

PNG chahiye to `src/components/Logo.tsx` mein `.svg` → `.png`. Brand color: `apps/frontend/src/index.css` mein `--brand`.

## 5. Self-service signup & Razorpay

Companies can sign up themselves at `/signup` → onboarding wizard (profile → plan → payment) → panel unlocked, instead of only via Super Admin → Companies → New company.

```env
# apps/backend/.env
APP_URL=http://localhost:3000          # frontend origin (used in emails/links)
SIGNUP_ENABLED=true                    # false disables /signup entirely
SIGNUP_TRIAL_ENABLED=true              # allow "Start free trial" without a card on plans with trialDays > 0
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
```

- **Test keys**: [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys → Generate Test Key.
- **Webhook**: Razorpay Dashboard → Settings → Webhooks → Add webhook → URL `https://<api-domain>/api/v1/payments/razorpay/webhook`, events `payment.captured`, `payment.failed`, `order.paid`. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`. Locally, use `ngrok http 5000` (or similar) to get a public URL for testing webhooks — without it, checkout still works, the wizard just relies on the client-side `/verify-payment` call instead of the webhook.
- **Test card**: `4111 1111 1111 1111`, any future expiry, any CVV, any OTP (test mode).
- Company creation always goes through `createCompanyWorkspace()` (backend `modules/companies/company.service.ts`) and payments always through `payments.service.ts` → `finalizePayment()`, which is idempotent — safe if both the client redirect and the webhook fire for the same payment.
- Super Admin can still create a company directly (Companies → New company), optionally ticking "Mark as paid" or "Start trial" — no Razorpay involved for that path.

## 6. Optional integrations

| Feature | Kahan set karo |
|---|---|
| Email notifications | Company Settings → Notifications → SMTP (Gmail: smtp.gmail.com, 587, app password) |
| SMS | Same page → MSG91 auth key, sender ID, DLT template |
| WhatsApp | Same page → Interakt / MSG91 / generic webhook |
| AI HR assistant | `apps/backend/.env` → `ANTHROPIC_API_KEY=sk-ant-...` (plan mein "Advanced Analytics" module chahiye) |
| Biometric devices | Section 7 |

## 7. Biometric devices (hardware agent)

Agent ek chhota program hai jo devices wale network ke kisi bhi PC (Windows/Linux) par chalta hai.

1. HRMS → **Devices → Agent setup → Generate key** → copy
2. Us PC par: `apps/hardware-agent/.env` mein `BACKEND_URL` (server ka URL) aur `HARDWARE_AGENT_KEY` daalo
3. `pnpm --filter @hrms/hardware-agent dev` (ya `build` + `start`)
4. Device add karo:
   - **Push/ADMS (recommended)**: device menu → Comm → Cloud Server → IP = agent PC, port = 5001. HRMS mein brand "ADMS / Push" + serial number.
   - **TCP (ZKTeco/eSSL 4370)**: agent folder mein `pnpm add node-zklib`; HRMS mein IP + port.
5. Device par employees **Map** karo → **Push users**. Punches automatically attendance ban jayengi. Internet jaye to agent local queue mein rakhta hai.

### USB-only biometric devices (no Ethernet/WiFi)

Kuch sasti fingerprint+RFID machines (jaise CP Plus ke "-U" variants) sirf USB/pendrive se data export karti hain, koi network port nahi hota. In devices ke saath live sync abhi possible nahi hai — ya to ek network-capable device lo, ya niche diya **Face kiosk** istemal karo (jo sirf ek purana Android/iOS phone/tablet mangta hai, koi naya hardware nahi).

## 8. Face-recognition kiosk (shared phone/tablet, no biometric hardware needed)

Ek purana Android/iOS phone ya tablet entrance par mount karke usse ek "kiosk" bana sakte ho — employees uske camera mein dekhenge aur system khud pehchan kar punch kar dega. Matching poori tarah **phone ke browser ke andar** hoti hai (`face-api.js`); koi photo HRMS server par upload nahi hoti jab tak punch actually confirm na ho.

1. **Face recognition** attendance feature plan mein included honi chahiye (Super Admin → Plans).
2. Ek naya role banao: **Roles → New role** → naam "Face Kiosk", permission sirf `attendance.kiosk` (ya "Face Kiosk" default role already seeded hai).
3. Us role ke saath ek user banao (jaise `kiosk@yourcompany.com`), aur shared phone ke browser mein login karke `/kiosk` URL par jao (ya sidebar → **Face kiosk**). Login persist karne ke liye "remember me"/browser session chhod do, bookmark bana lo.
4. Har employee ko enroll karo: **Employees → [employee] → Overview → Face recognition → Enroll** — ek baar saaf, seedhi photo camera se capture karo.
5. Kiosk phone ko entrance par rakh do, screen on rakho. Employee saamne aayega → system naam dikha kar automatically punch kar dega (30 second cooldown per person, dobara turant punch nahi hoga).

⚠️ **Limitation**: browser-based face recognition dedicated biometric hardware jitna accurate nahi hai (lighting/angle sensitive), aur abhi **liveness detection nahi hai** (photo dikhakar spoof possible hai) — high-security use ke liye dedicated hardware device behtar rahega.

## 9. Production deploy

```bash
# Server par (Ubuntu + Node 20 + pnpm)
pnpm install
pnpm db:migrate          # migrations from database/migrations (ya dev mein db:push)
pnpm db:seed
pnpm build               # backend dist + frontend dist

# Backend
cd apps/backend && NODE_ENV=production node dist/index.js      # ya pm2 start dist/index.js --name hrms-api
# Frontend: apps/frontend/dist ko Nginx/Vercel/Netlify se serve karo; VITE_API_URL = https://api.yourdomain.com/api/v1
```

- `CORS_ORIGIN` mein frontend ka domain daalo (comma-separated multiple)
- Uploads `apps/backend/uploads/` mein — backup lo ya S3/Cloudinary adapter lagao
- Redis + BullMQ chahiye to `src/queue/index.ts` same interface ke saath swap karo
- Ek subdomain (Nginx + PM2) par frontend + API ek saath serve karne ke ready-made config: `deploy/nginx.hrms.conf`, `deploy/ecosystem.config.cjs`

## 10. Commands

```bash
pnpm dev             # sab apps
pnpm typecheck       # 4 packages
pnpm build
pnpm db:push         # schema → DB (dev)
pnpm db:generate     # naya migration file
pnpm db:migrate      # migrations apply (prod)
pnpm db:seed
pnpm db:studio       # DB GUI
pnpm --filter @hrms/backend dev    # sirf backend
```

## 11. Structure

```
hrms-saas/
├── apps/
│   ├── frontend/   React + Vite + Tailwind — src/pages/{platform,company}, layouts, components/ui
│   ├── backend/    Express + Drizzle + Neon — src/modules/<name>/*.routes.ts, middleware/, jobs/, queue/
│   └── hardware-agent/  adapters (adms, zkteco, simulator), adms.server.ts, queue.ts
├── packages/shared-types/   permissions, modules, statuses, API types
├── database/migrations/     0000_init.sql (52 tables)
├── docs/                    CLAUDE_CODE_PROMPTS.md, SRS.md (apna SRS yahan paste karo)
└── CLAUDE.md                Claude Code ke liye codebase rules
```

## 12. Common problems

| Problem | Fix |
|---|---|
| `Invalid environment variables` | `apps/backend/.env` mein DATABASE_URL / JWT secrets (min 16 chars) check karo |
| `pnpm db:push` fails | Neon connection string mein `?sslmode=require` hai? Project awake hai? |
| Login par "Company suspended / expired" | Super Admin → Companies → company → Reactivate / Extend |
| Sidebar mein module nahi dikh raha | Plan mein module nahi hai — Super Admin plan ya add-on se enable karo |
| Employee ko leave/attendance nahi dikh raha | Employee record ka login link nahi — Employees → employee → Edit (ya naya employee login ke saath banao) |
| Port 3000/5000 busy | `.env` mein PORT badlo, frontend `vite.config.ts` port |
| Payroll mein employee nahi aaya | Uska Salary structure set nahi / joining date month ke baad |
