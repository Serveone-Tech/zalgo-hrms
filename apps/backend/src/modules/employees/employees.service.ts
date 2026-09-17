import { and, eq, count, sql, notInArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { employees, companies } from "../../db/schema.js";
import { limitReached } from "../../common/errors.js";

// Section 31: employee limit backend par enforce
export async function assertEmployeeCapacity(companyId: string, limit: number) {
  const [{ n }] = await db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, companyId), notInArray(employees.status, ["resigned", "terminated"])));
  if (n >= limit) throw limitReached(`Subscription limit reached (${limit} employees). Upgrade plan or buy an employee pack.`);
  return n;
}

// Employee code: <COMPANY_CODE or 3 letters>-0001 — company settings.employeeCodePrefix override kar sakti hai
export async function nextEmployeeCode(companyId: string) {
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const prefix = (c.settings as any)?.employeeCodePrefix ?? c.code ?? c.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const [{ n }] = await db.select({ n: count() }).from(employees).where(eq(employees.companyId, companyId));
  let seq = n + 1;
  // collision-safe
  for (;;) {
    const code = `${prefix}-${String(seq).padStart(4, "0")}`;
    const [dupe] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.employeeCode, code))).limit(1);
    if (!dupe) return code;
    seq++;
  }
}

export const fullName = sql<string>`trim(${employees.firstName} || ' ' || ${employees.lastName})`;
