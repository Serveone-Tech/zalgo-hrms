import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Coffee, LogIn, LogOut, Play } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { api, errMsg } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Loading, Stat, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate } from "@/lib/utils";
import { AttBadge, hhmm, hrs, useElapsedSeconds, fmtHMS } from "./shared";
import { SelfieCapture } from "@/components/company/SelfieCapture";
import { useActivityHeartbeat } from "@/lib/activityHeartbeat";

type Att = { id: string; date: string; status: string; checkIn: string | null; checkOut: string | null; workMinutes: number; breakMinutes: number; lateMinutes: number; overtimeMinutes: number };
type Live = { status: "working" | "break" | "offline"; breakReason: string | null; since: string | null; lastActivityAt: string | null } | null;
type Me = { employeeId: string; today: string; rows: Att[]; todayLogs: { id: string; punchedAt: string; source: string }[]; live: Live };
type Settings = { selfCheckInEnabled: boolean; selfieRequired: boolean; gpsRequired: boolean; activityTrackingEnabled: boolean; manualBreakEnabled: boolean };
type Correction = { id: string; date: string; type: string; reason: string; status: "pending" | "approved" | "rejected"; createdAt: string };

const BREAK_REASONS: { value: "manual" | "lunch" | "personal"; label: string }[] = [
  { value: "lunch", label: "Lunch break" }, { value: "personal", label: "Personal break" }, { value: "manual", label: "Break" },
];
const CORRECTION_TYPES: { value: string; label: string }[] = [
  { value: "forgot_checkin", label: "Forgot to check in" }, { value: "forgot_checkout", label: "Forgot to check out" },
  { value: "wrong_location", label: "Wrong location" }, { value: "device_problem", label: "Device problem" },
  { value: "network_problem", label: "Network problem" }, { value: "timer_issue", label: "Timer issue" }, { value: "other", label: "Other" },
];

function getPosition(): Promise<GeolocationPosition | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(undefined), { timeout: 6000, enableHighAccuracy: true });
  });
}

export default function MyAttendance() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useGet<Me | null>(["my-attendance", month], `/attendance/me?month=${month}`);
  const settingsQ = useGet<Settings>(["attendance-settings"], "/attendance/settings");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [breakPicker, setBreakPicker] = useState(false);
  const [selfieBlob, setSelfieBlob] = useState<Blob | null>(null);
  const corrections = useGet<Correction[]>(["my-corrections"], "/attendance/corrections");
  const correctionAct = useAction([["my-corrections"]]);
  const [correctionForm, setCorrectionForm] = useState<{ date: string; type: string; reason: string } | null>(null);

  const d = data?.data;
  const s = settingsQ.data?.data;
  const live = d?.live ?? null;
  const elapsed = useElapsedSeconds(live?.status !== "offline" ? live?.since : null);
  useActivityHeartbeat(!!s?.activityTrackingEnabled && live?.status === "working");

  const refresh = () => { qc.invalidateQueries({ queryKey: ["my-attendance"] }); };

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try { await fn(); refresh(); } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(null); }
  }
  async function checkin() {
    if (s?.selfieRequired && !selfieBlob) { toast("Please capture a selfie first", "error"); return; }
    await run("checkin", async () => {
      let selfieUrl: string | undefined;
      if (selfieBlob) {
        const form = new FormData(); form.append("file", selfieBlob, "selfie.jpg");
        const up = await api.post<{ data: { url: string } }>("/attendance/self/selfie", form, { headers: { "Content-Type": "multipart/form-data" } });
        selfieUrl = up.data.data.url;
      }
      const pos = await getPosition();
      await api.post("/attendance/self/checkin", { latitude: pos?.coords.latitude, longitude: pos?.coords.longitude, accuracy: pos?.coords.accuracy, selfieUrl });
      setSelfieBlob(null);
      toast("Checked in");
    });
  }
  const checkout = () => run("checkout", async () => { await api.post("/attendance/self/checkout"); toast("Checked out"); });
  const startBreak = (reason: "manual" | "lunch" | "personal") => run("break", async () => { await api.post("/attendance/self/break/start", { reason }); setBreakPicker(false); toast("Break started"); });
  const resume = () => run("resume", async () => { await api.post("/attendance/self/resume"); toast("Work resumed"); });

  if (isLoading || settingsQ.isLoading) return <Loading />;
  if (!d) return <><PageHeader title="My attendance" /><Empty text="Your login isn't linked to an employee record. Ask HR to link it." /></>;
  if (s && !s.selfCheckInEnabled) return <><PageHeader title="My attendance" /><Empty text="Self check-in is currently disabled by your company. Ask HR to mark your attendance." /></>;

  const t = d.rows.reduce((a, r) => ({ p: a.p + (["present", "late", "early_out", "work_from_home"].includes(r.status) ? 1 : 0), h: a.h + (r.status === "half_day" ? 1 : 0), a: a.a + (r.status === "absent" ? 1 : 0), l: a.l + (r.status === "late" ? 1 : 0), w: a.w + r.workMinutes }), { p: 0, h: 0, a: 0, l: 0, w: 0 });
  const todayRow = d.rows.find((r) => r.date === d.today);
  const liveActiveMinutes = (todayRow?.workMinutes ?? 0) + (live?.status === "working" ? Math.floor(elapsed / 60) : 0);
  const liveBreakMinutes = (todayRow?.breakMinutes ?? 0) + (live?.status === "break" ? Math.floor(elapsed / 60) : 0);

  return (
    <>
      <PageHeader title="My attendance" sub={fmtDate(d.today)} actions={<Button variant="secondary" size="sm" onClick={() => setCorrectionForm({ date: d.today, type: "forgot_checkout", reason: "" })}>Request correction</Button>} />

      <div className="card p-6 mb-5">
        {(!live || live.status === "offline") && (
          <div className="max-w-sm mx-auto text-center">
            <h2 className="font-bold text-lg mb-3">Today's attendance</h2>
            {s?.selfieRequired && <div className="mb-4"><SelfieCapture onCaptured={setSelfieBlob} /></div>}
            <p className="text-xs text-muted mb-3">{s?.gpsRequired || s?.selfieRequired ? "Location will be verified when you check in." : "Location is captured automatically where required."}</p>
            <Button size="lg" className="w-full" loading={busy === "checkin"} onClick={checkin}><LogIn size={16} /> Check In</Button>
          </div>
        )}
        {live?.status === "working" && (
          <div className="max-w-sm mx-auto text-center">
            <div className="text-sm text-good font-semibold flex items-center justify-center gap-1.5">🟢 Working</div>
            <div className="text-4xl font-extrabold tabular-nums mt-2">{fmtHMS(elapsed)}</div>
            <p className="text-xs text-muted mt-1">Checked in {hhmm(live.since)}</p>
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1" disabled={!s?.manualBreakEnabled} loading={busy === "break"} onClick={() => setBreakPicker(true)}><Coffee size={16} /> Start Break</Button>
              <Button variant="danger" className="flex-1" loading={busy === "checkout"} onClick={checkout}><LogOut size={16} /> Check Out</Button>
            </div>
          </div>
        )}
        {live?.status === "break" && (
          <div className="max-w-sm mx-auto text-center">
            <div className="text-sm text-warn font-semibold">{live.breakReason === "inactivity" ? "⏸ Timer Paused" : "☕ On Break"}</div>
            <div className="text-4xl font-extrabold tabular-nums mt-2">{fmtHMS(elapsed)}</div>
            <p className="text-xs text-muted mt-1">{live.breakReason === "inactivity" ? "Reason: No activity detected for a while" : `Reason: ${live.breakReason}`}</p>
            <div className="flex gap-2 mt-5">
              <Button className="flex-1" loading={busy === "resume"} onClick={resume}><Play size={16} /> Resume Work</Button>
              <Button variant="danger" className="flex-1" loading={busy === "checkout"} onClick={checkout}><LogOut size={16} /> Check Out</Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Stat label="Active work today" value={hrs(liveActiveMinutes)} tone="good" />
        <Stat label="Break today" value={hrs(liveBreakMinutes)} />
        <Stat label="Check-in" value={hhmm(todayRow?.checkIn ?? live?.since ?? null)} />
        <Stat label="Status" value={<AttBadge s={todayRow?.status} />} />
      </div>

      <div className="card p-4 mb-5 flex flex-wrap items-center gap-4"><span className="text-sm font-semibold">Today's punches</span>{d.todayLogs.length ? d.todayLogs.map((l, i) => <span key={l.id} className="text-sm tabular-nums rounded bg-surface-2 px-2 py-1">{i % 2 === 0 ? "In" : "Out"} {hhmm(l.punchedAt)} <span className="text-muted text-xs">({l.source})</span></span>) : <span className="text-sm text-muted">Not checked in yet.</span>}</div>

      <div className="flex items-center gap-3 mb-4"><input className="field w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-5"><Stat label="Present" value={t.p} tone="good" /><Stat label="Half days" value={t.h} /><Stat label="Absent" value={t.a} tone={t.a ? "danger" : undefined} /><Stat label="Late" value={t.l} tone={t.l ? "warn" : undefined} /><Stat label="Hours" value={hrs(t.w)} /></div>
      {!d.rows.length ? <Empty text="No attendance records this month." /> : <div className="card overflow-x-auto"><table className="w-full min-w-[560px]"><thead><tr><th className="th">Date</th><th className="th">In</th><th className="th">Out</th><th className="th">Worked</th><th className="th">Break</th><th className="th">Status</th></tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r.id}><td className="td">{fmtDate(r.date)}</td><td className="td tabular-nums">{hhmm(r.checkIn)}</td><td className="td tabular-nums">{hhmm(r.checkOut)}</td><td className="td tabular-nums">{r.workMinutes ? hrs(r.workMinutes) : "—"}</td><td className="td tabular-nums text-muted">{r.breakMinutes ? hrs(r.breakMinutes) : "—"}</td><td className="td"><AttBadge s={r.status} />{r.lateMinutes > 0 && <span className="ml-2 text-xs text-warn">+{r.lateMinutes}m</span>}</td></tr>)}</tbody></table></div>}

      {!!corrections.data?.data?.length && (
        <>
          <h2 className="font-bold mt-8 mb-3">Correction requests</h2>
          <div className="card divide-y divide-line">{corrections.data.data.map((c) => (
            <div key={c.id} className="px-5 py-3 text-sm flex justify-between gap-3">
              <span>{fmtDate(c.date)} — {CORRECTION_TYPES.find((t) => t.value === c.type)?.label ?? c.type}<span className="text-muted"> — {c.reason}</span></span>
              <Badge status={c.status === "approved" ? "active" : c.status === "rejected" ? "rejected" : "pending"} />
            </div>
          ))}</div>
        </>
      )}

      <Modal open={breakPicker} onClose={() => setBreakPicker(false)} title="Start a break">
        <Field label="Reason">
          <div className="grid gap-2">{BREAK_REASONS.map((b) => <Button key={b.value} variant="secondary" loading={busy === "break"} onClick={() => startBreak(b.value)}>{b.label}</Button>)}</div>
        </Field>
      </Modal>

      <Modal open={!!correctionForm} onClose={() => setCorrectionForm(null)} title="Request attendance correction">
        {correctionForm && <div className="space-y-4">
          <Field label="Date"><input className="field" type="date" value={correctionForm.date} onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })} /></Field>
          <Field label="Issue"><select className="field" value={correctionForm.type} onChange={(e) => setCorrectionForm({ ...correctionForm, type: e.target.value })}>{CORRECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
          <Field label="Explain what happened"><textarea className="field" rows={3} value={correctionForm.reason} onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCorrectionForm(null)}>Cancel</Button>
            <Button loading={correctionAct.isPending} disabled={correctionForm.reason.length < 3} onClick={() => correctionAct.mutate({ url: "/attendance/corrections", body: correctionForm }, { onSuccess: () => setCorrectionForm(null) })}>Submit</Button>
          </div>
        </div>}
      </Modal>
    </>
  );
}
