import type { Request } from "express";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../db/index.js";
import { employees } from "../db/schema.js";

// Section 37: data scope. Returns extra WHERE for employee-level tables.
// company → none; branch → branchIds; department → own department; team → reporting employees; own → self.
export async function employeeScopeWhere(req: Request, table: { companyId: any; branchId: any; departmentId?: any; id?: any; employeeId?: any }): Promise<SQL | undefined> {
  const u = req.user!; const t = req.tenant!;
  const base = eq(table.companyId, t.companyId);
  if (u.type === "super_admin" || u.scope === "company") return base;
  if (u.scope === "branch") return and(base, t.branchIds === "all" ? undefined : inArray(table.branchId, t.branchIds.length ? t.branchIds : ["00000000-0000-0000-0000-000000000000"]));
  // department / team / own need the caller's employee record
  const [me] = await db.select().from(employees).where(and(eq(employees.companyId, t.companyId), eq(employees.userId, u.id))).limit(1);
  const NONE = ["00000000-0000-0000-0000-000000000000"];
  const idCol = table.employeeId ?? table.id;
  if (!me) return and(base, inArray(idCol, NONE));
  if (u.scope === "department") return and(base, table.departmentId && me.departmentId ? eq(table.departmentId, me.departmentId) : inArray(idCol, [me.id]));
  if (u.scope === "team") {
    const team = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, t.companyId), eq(employees.reportingManagerId, me.id)));
    return and(base, or(inArray(idCol, [me.id, ...team.map((x) => x.id)]))!);
  }
  return and(base, inArray(idCol, [me.id]));
}
