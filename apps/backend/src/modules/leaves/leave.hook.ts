import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { leaveRequests, leaveTypes } from "../../db/schema.js";
// Attendance processor hook: approved leave → on_leave / half day / WFH (Section 47)
export async function leaveFor(companyId: string, employeeId: string, date: string): Promise<{ onLeave: boolean; halfDay: boolean; wfh: boolean }> {
  const [r] = await db.select({ halfDay: leaveRequests.halfDay, kind: leaveTypes.kind }).from(leaveRequests).innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, "approved"), lte(leaveRequests.fromDate, date), gte(leaveRequests.toDate, date))).limit(1);
  if (!r) return { onLeave: false, halfDay: false, wfh: false };
  if (r.kind === "wfh") return { onLeave: false, halfDay: false, wfh: true };
  return { onLeave: !r.halfDay, halfDay: !!r.halfDay, wfh: false };
}
