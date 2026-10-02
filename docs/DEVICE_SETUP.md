# Attendance devices — sab options ek jagah

Yeh file har us tarike ko list karti hai jisse employees ki attendance HRMS mein aa sakti hai —
kaunsa option kab use karo, aur process step-by-step. Future mein jab bhi koi naya device/company
join kare, yahi file follow karo.

Attendance kahin se bhi aaye (hardware agent, face kiosk, ya manual), sab ek hi jagah jaake
milte hain: `attendanceLogs` table → `processor.ts` ka `computeDay()` in/out pair karke
final attendance banata hai. Isliye naya source add karna matlab sirf ek naya "punch writer"
banana hai, poora time-calculation engine dobara nahi likhna padta.

---

## Option A — Network biometric device (ADMS / Push) — recommended

Jin devices mein **Comm → Cloud Server / ADMS** jaisa menu ho (zyada tar naye ZKTeco, eSSL,
Realtime, Matrix models).

1. HRMS → **Devices → Agent setup → Generate key** → key copy karo.
2. Jis PC/mini-PC par devices wale network se connectivity hai (Windows/Linux), wahan:
   - `apps/hardware-agent/.env` mein `BACKEND_URL` (HRMS server ka URL) aur
     `HARDWARE_AGENT_KEY` (upar wali key) daalo.
   - `pnpm --filter @hrms/hardware-agent dev` (production mein `build` + `start`, ya PM2).
3. Device ki settings mein: **Comm → Cloud Server** (ya ADMS) → Server IP = agent chalane
   wale PC ka IP, Port = `5001` (default), Enable = ON.
4. HRMS → **Devices → Add device** → brand = **"ADMS / Push"**, serial number device ki
   screen se (Menu → System Info → Device ID/Serial) copy karo.
5. **Devices → [device] → Map employees** → har device-user ko HRMS employee se link karo.
6. **Push users** click karo — employee list device par chali jaati hai (fingerprint/card
   already device par hi enroll honi chahiye, HRMS sirf naam/ID push karta hai).
7. Ab jab bhi koi punch karega, device khud agent ko bhejega → agent backend ko bhejega →
   turant attendance mein dikhega. Internet/agent down ho to device/agent apne paas queue
   kar lete hain, wapas aate hi sync ho jaata hai.

## Option B — Network biometric device (TCP poll, port 4370)

Jin devices mein Cloud Server/ADMS option nahi hai lekin ethernet port hai aur ZK protocol
(zyada tar purane ZKTeco/eSSL models, port 4370).

1. Agent wale PC par: `cd apps/hardware-agent && pnpm add node-zklib`
2. HRMS → **Devices → Add device** → brand = **"ZKTeco"** (ya "eSSL"/"Matrix" — sab same
   adapter use karte hain), device ka **IP address** aur **port (4370)** daalo — device
   same LAN par agent ke saath hona chahiye.
3. Baaki steps same hain: Map employees → Push users.
4. Agent har `pollIntervalSec` (device setting mein set hota hai) par device se naye logs
   khud khींch (poll) leta hai.

## Option C — USB-only devices (no Ethernet/WiFi) — live sync possible NAHI hai

Kuch sasti fingerprint+RFID machines (jaise CP Plus ke "-U" variants, e.g. CP-VTA-T2324-U)
sirf USB/pendrive se data export karti hain — koi network port hi nahi hota.

- In devices ke saath **real-time sync is not possible** current architecture mein, kyunki
  agent ko network pe device se connect hona padta hai (poll ya push dono mein).
- Options:
  1. Agar possible ho, network-capable device (Option A/B) le lo — long-term sahi solution.
  2. Ya niche diya **Option D — Face kiosk** use karo (sirf ek purana phone/tablet chahiye,
     naya hardware kharidna nahi padta).
  3. (Not built) Manual CSV import — agar kabhi chahiye ho to device ke USB export file ko
     parse karke `attendanceLogs` mein bulk insert karne wala ek admin tool bana sakte hain,
     lekin yeh near-real-time nahi, batch/end-of-day hoga.

## Option D — Face-recognition kiosk (shared phone/tablet, zero hardware cost)

Koi bhi purana Android/iOS phone ya tablet entrance par mount karke "kiosk" bana sakte ho.
Matching poori tarah **phone ke browser ke andar** hoti hai (`face-api.js`), koi naya
hardware nahi chahiye.

1. Company ke subscription plan mein **Face recognition** attendance feature included
   honi chahiye (Super Admin → Plans → Attendance features).
2. **Roles** mein "Face Kiosk" role already seeded hai (permission: `attendance.kiosk`
   akela) — agar nahi hai to naya role isi permission ke saath banao.
3. Usi role se ek user banao (e.g. `kiosk@company.com`), shared phone ke browser mein
   login karke `/kiosk` URL kholo (ya sidebar → **Face kiosk**). Session logged-in chhod do.
4. Har employee ko enroll karo: **Employees → [employee] → Face recognition → Enroll** —
   ek saaf, seedhi photo camera se capture hogi (128-point descriptor save hota hai,
   actual photo kahin store nahi hoti).
5. Phone entrance par rakh do, screen on rakho — employee camera ke saamne aayega,
   system naam dikha kar automatically punch kar dega (30s cooldown per person).

⚠️ **Limitation**: liveness detection nahi hai (photo dikhakar spoof ho sakta hai), aur
lighting/angle sensitive hai. High-security use ke liye dedicated biometric hardware
(Option A/B) behtar rahega.

---

## Developer section — naya device brand/adapter code mein add karna

Agar kabhi koi naya hardware brand support karna ho (jiska protocol ZK-compatible na ho),
process:

1. `apps/hardware-agent/src/adapters/base.ts` mein `DeviceAdapter` interface dekho — har
   adapter ko yeh implement karna hota hai: `connect`, `disconnect`, `getStatus`,
   `getDeviceInfo`, `getLogs`, `syncUsers`, `pushUsers`.
2. Reference implementations:
   - `adapters/adms.ts` — push-mode (device khud HTTP se agent ko punches bhejta hai).
   - `adapters/zkteco.ts` — poll-mode (agent `node-zklib` se device se khud fetch karta hai).
   - `adapters/simulator.ts` — testing ke liye fake device.
3. Naya adapter file banao (`adapters/<brand>.ts`), `mode: "poll" | "push"` decide karo
   brand ke protocol docs ke hisaab se, aur end mein
   `registerAdapter("<brand>", () => new YourAdapter())` call karo.
4. `apps/hardware-agent/src/index.ts` (ya jahan adapters import hote hain) mein naye file
   ka import add karo taaki registry mein register ho.
5. HRMS frontend mein Devices → Add device ka brand dropdown — naya brand waha bhi add
   karna hoga (`apps/frontend/src/pages/company/Devices.tsx`).
6. Koi backend schema change nahi chahiye — `attendanceLogs` aur poora processing pipeline
   brand-agnostic hai, sab RawPunch ek hi format mein aate hain.

Naya **non-hardware** punch source (jaise Option D ka kiosk) add karna aur bhi simple hai —
hardware-agent ki zaroorat hi nahi, seedha backend mein ek authenticated endpoint banao jo
`attendanceLogs` mein insert karke `reprocessAroundPunch()` call kare (dekho
`apps/backend/src/modules/attendance/attendance.routes.ts` mein `POST /kiosk/punch` ka
example).
