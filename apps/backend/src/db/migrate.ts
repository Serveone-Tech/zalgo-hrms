// Production: `pnpm db:migrate` — database/migrations ke SQL files apply karta hai (drizzle-kit generate se bane).
import { migrate } from "drizzle-orm/neon-http/migrator";
import { db } from "./index.js";
await migrate(db, { migrationsFolder: "../../database/migrations" });
console.log("✅ Migrations applied");
