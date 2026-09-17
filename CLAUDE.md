# Zalgo HRMS SaaS — rules for Claude Code

Read `docs/SRS.md` for full requirements and `README.md` for setup.

## Non-negotiable rules
1. Every tenant table has `company_id`. Branch-level tables also have `branch_id`.
2. Every company query filters by `req.tenant!.companyId`. Never trust a company id from the request body/params.
3. Every company route stack: `requireAuth, requireTenant, [requireModule("<key>")], requirePermission("<resource.action>")`.
4. Subscription limits (`req.tenant.limits`) and modules are enforced in the backend. Frontend only hides.
5. A branch is never `active` without Super Admin approval (branch_requests flow).
6. No hardcoded prices, plans, permissions, or company logic. Add new permissions to `packages/shared-types/src/index.ts` PERMISSIONS; new modules to MODULES.
7. Call `audit(req, action, entity, id, details)` for create/update/delete/approve/reject.
8. API responses: `{ success, message, data, meta? }` via `ok()` / `created()`; errors via `AppError` subclasses.
9. Validate with zod on the backend (`validate(schema)`) and react-hook-form + zod on the frontend.
10. One module = `apps/backend/src/modules/<name>/<name>.routes.ts` (+ `.service.ts` for logic). Register in `src/routes.ts`.
11. Company creation always goes through `createCompanyWorkspace()` (`modules/companies/company.service.ts`); payments always through `payments.service.ts` `finalizePayment()` (idempotent — the client redirect and the Razorpay webhook may both call it for the same payment).

## Stack
- Events: call `emitEvent("trigger", payload)` (automation) and `notify({...})` (notifications) from modules; never send email/SMS directly.
- Backend: Express 4, TypeScript (NodeNext, `.js` import suffixes), Drizzle ORM, Neon Postgres (`@neondatabase/serverless` http driver — no transactions across multiple statements; keep writes idempotent), Socket.IO, zod.
- Frontend: React 18 + Vite + Tailwind (tokens in `src/index.css`), TanStack Query (`useGet`/`useAction` in `src/lib/queries.ts`), zustand auth store, react-router 6. UI primitives in `src/components/ui`. Logo via `<Logo />` (light/dark files in `public/`).
- Hardware agent: `apps/hardware-agent`, adapter interface in `src/adapters/base.ts`.

## Workflow
- After schema changes: `pnpm db:push` (dev) or `pnpm db:generate` (migration).
- Always finish with `pnpm typecheck`.
- Keep files under ~250 lines; split components and services.
