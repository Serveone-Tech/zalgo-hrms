import { Badge } from "@/components/ui/badge";
export const ATT_LABEL: Record<string, string> = { present: "Present", absent: "Absent", half_day: "Half day", late: "Late", early_out: "Early out", work_from_home: "WFH", on_leave: "On leave", holiday: "Holiday", week_off: "Week off", missing_punch: "Missing punch", not_processed: "Not processed" };
const tone: Record<string, string> = { present: "active", late: "pending", early_out: "pending", half_day: "pending", absent: "rejected", missing_punch: "rejected", on_leave: "trial", holiday: "inactive", week_off: "inactive", work_from_home: "trial", not_processed: "draft" };
export const AttBadge = ({ s }: { s?: string | null }) => <Badge status={tone[s ?? "not_processed"]}>{ATT_LABEL[s ?? "not_processed"]}</Badge>;
export const hhmm = (d?: string | null) => (d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—");
export const hrs = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
export const todayStr = () => new Date().toISOString().slice(0, 10);
