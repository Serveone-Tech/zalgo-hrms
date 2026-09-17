import { useState } from "react";
import { Plus, Wifi, WifiOff, RefreshCw, AlertTriangle, Copy } from "lucide-react";
import { useGet, useAction } from "@/lib/queries";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Loading, Empty, Field } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { fmtDate, cn } from "@/lib/utils";
import type { Branch } from "./employees/types";

type Device = { id: string; name: string; type: string; brand: string; model: string | null; serialNumber: string; ipAddress: string | null; port: number | null; location: string | null; pollIntervalSec: number; status: string; lastHeartbeatAt: string | null; lastSyncAt: string | null; lastLogAt: string | null; userCount: number; lastError: string | null; branchId: string; branchName: string | null; mappedUsers: number; pushUsersRequested: boolean };
type Detail = Device & { mapped: { id: string; employeeId: string; deviceUserId: string; syncedToDevice: boolean; name: string; employeeCode: string }[]; logs: { id: string; level: string; event: string; message: string | null; createdAt: string }[] };
const blank = { name: "", branchId: "", type: "fingerprint", brand: "adms", model: "", serialNumber: "", ipAddress: "", port: 4370, location: "", pollIntervalSec: 60 };
const BRANDS: Record<string, string> = { adms: "ADMS / Push (ZKTeco, eSSL cloud mode)", zkteco: "ZKTeco (TCP 4370)", essl: "eSSL (TCP 4370)", matrix: "Matrix", simulator: "Simulator (testing)" };
const ago = (d?: string | null) => { if (!d) return "never"; const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(d); };

export default function Devices() {
  const can = useAuth((s) => s.can); const { toast } = useToast();
  const { data, isLoading } = useGet<Device[]>(["devices"], "/devices");
  const branches = useGet<Branch[]>(["branches"], "/branches");
  const act = useAction([["devices"], ["device"], ["company-dashboard"]]);
  const [m, setM] = useState<(typeof blank & { id?: string }) | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const detail = useGet<Detail>(["device", selId], `/devices/${selId}`, !!selId);
  const [setup, setSetup] = useState(false);
  const key = useGet<{ agentKey: string | null }>(["agent-key"], "/devices/agent-key", setup && can("device.manage"));
  const keyAct = useAction([["agent-key"]]);
  const [mapIds, setMapIds] = useState("");
  const emps = useGet<{ id: string; name: string; employeeCode: string }[]>(["managers"], "/employees/managers", !!selId);
  const online = data?.data?.filter((d) => d.status === "online").length ?? 0;

  return (
    <>
      <PageHeader title="Devices" sub={`${online} of ${data?.data?.length ?? 0} online`} actions={can("device.manage") && <><Button variant="secondary" onClick={() => setSetup(true)}>Agent setup</Button><Button onClick={() => setM({ ...blank })}><Plus size={16} /> Add device</Button></>} />
      {isLoading ? <Loading /> : !data?.data?.length ? <Empty text="No devices yet. Add a device, then run the hardware agent on a PC in the same network." action={can("device.manage") && <Button variant="secondary" onClick={() => setSetup(true)}>How to set up the agent</Button>} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.data.map((d) => (
          <button key={d.id} onClick={() => setSelId(d.id)} className="card p-4 text-left hover:border-brand transition-colors">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-bold truncate">{d.name}</h3><p className="text-xs text-muted">{d.branchName} · {d.location ?? BRANDS[d.brand]?.split(" ")[0]} · {d.type.replace("_", " ")}</p></div>
              <span className={cn("shrink-0 grid place-items-center h-8 w-8 rounded-full", d.status === "online" ? "bg-good/15 text-good" : d.status === "error" ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted")}>{d.status === "online" ? <Wifi size={15} /> : d.status === "error" ? <AlertTriangle size={15} /> : <WifiOff size={15} />}</span></div>
            <div className="mt-3 flex items-center gap-2"><Badge status={d.status} />{d.pushUsersRequested && <span className="text-[11px] text-muted">sync pending</span>}</div>
            <dl className="mt-3 text-[13px] grid grid-cols-2 gap-x-3 gap-y-1"><dt className="text-muted">Serial</dt><dd className="font-mono text-xs truncate">{d.serialNumber}</dd><dt className="text-muted">Last punch</dt><dd>{ago(d.lastLogAt)}</dd><dt className="text-muted">Heartbeat</dt><dd>{ago(d.lastHeartbeatAt)}</dd><dt className="text-muted">Users</dt><dd>{d.mappedUsers} mapped · {d.userCount} on device</dd></dl>
            {d.lastError && <p className="mt-2 text-xs text-danger truncate" title={d.lastError}>{d.lastError}</p>}
          </button>))}</div>
      )}

      <Modal open={!!m} onClose={() => setM(null)} title={m?.id ? `Edit ${m.name}` : "Add device"} wide>{m && <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Device name"><input className="field" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Main gate biometric" /></Field>
          <Field label="Branch"><select className="field" value={m.branchId} onChange={(e) => setM({ ...m, branchId: e.target.value })}><option value="">Select…</option>{branches.data?.data?.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Connection / brand"><select className="field" value={m.brand} onChange={(e) => setM({ ...m, brand: e.target.value })}>{Object.entries(BRANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Type"><select className="field" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value })}><option value="fingerprint">Fingerprint</option><option value="face">Face recognition</option><option value="rfid">RFID / card</option><option value="access_control">Access control</option></select></Field>
          <Field label="Serial number (as printed on device)"><input className="field font-mono" value={m.serialNumber} onChange={(e) => setM({ ...m, serialNumber: e.target.value })} /></Field>
          <Field label="Model"><input className="field" value={m.model} onChange={(e) => setM({ ...m, model: e.target.value })} /></Field>
          {m.brand !== "adms" && m.brand !== "simulator" && <><Field label="IP address"><input className="field font-mono" value={m.ipAddress} onChange={(e) => setM({ ...m, ipAddress: e.target.value })} placeholder="192.168.1.201" /></Field><Field label="Port"><input className="field" type="number" value={m.port} onChange={(e) => setM({ ...m, port: Number(e.target.value) })} /></Field></>}
          <Field label="Location label"><input className="field" value={m.location} onChange={(e) => setM({ ...m, location: e.target.value })} placeholder="Reception" /></Field>
          <Field label="Poll interval (sec)"><input className="field" type="number" min={10} value={m.pollIntervalSec} onChange={(e) => setM({ ...m, pollIntervalSec: Number(e.target.value) })} /></Field>
        </div>
        {m.brand === "adms" && <p className="text-xs text-muted rounded-md bg-surface-2 p-3">Push mode: on the device go to <b>Comm → Cloud Server / ADMS</b>, set server address = the PC running the agent, port = 5001. The device sends punches itself; no IP needed here.</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setM(null)}>Cancel</Button><Button loading={act.isPending} disabled={!m.name || !m.branchId || !m.serialNumber} onClick={() => { const { id, ...body } = m; act.mutate({ method: id ? "put" : "post", url: id ? `/devices/${id}` : "/devices", body: { ...body, ipAddress: body.ipAddress || null, model: body.model || null, location: body.location || null } }, { onSuccess: () => setM(null) }); }}>Save device</Button></div>
      </div>}</Modal>

      <Modal open={!!selId} onClose={() => { setSelId(null); setMapIds(""); }} title={detail.data?.data?.name ?? "Device"} wide>{detail.data?.data && (() => { const d = detail.data!.data!; return <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3"><Badge status={d.status} /><span className="text-sm text-muted">{BRANDS[d.brand]} · {d.serialNumber}{d.ipAddress ? ` · ${d.ipAddress}:${d.port}` : ""}</span>
          {can("device.manage") && <span className="ml-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => setM({ id: d.id, name: d.name, branchId: d.branchId, type: d.type, brand: d.brand, model: d.model ?? "", serialNumber: d.serialNumber, ipAddress: d.ipAddress ?? "", port: d.port ?? 4370, location: d.location ?? "", pollIntervalSec: d.pollIntervalSec })}>Edit</Button><Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/devices/${d.id}/push-users` })}><RefreshCw size={13} /> Push users</Button><Button size="sm" variant="ghost" onClick={() => act.mutate({ url: `/devices/${d.id}/status`, body: { disabled: d.status !== "disabled" } })}>{d.status === "disabled" ? "Enable" : "Disable"}</Button><Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm("Remove device?") && act.mutate({ method: "delete", url: `/devices/${d.id}` }, { onSuccess: () => setSelId(null) })}>Remove</Button></span>}</div>
        {d.lastError && <p className="text-sm text-danger rounded-md bg-danger/10 px-3 py-2">{d.lastError}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <div><h3 className="font-bold text-sm mb-2">Mapped employees ({d.mapped.length})</h3>
            {can("device.manage") && <div className="flex gap-2 mb-2"><select multiple className="field h-28 flex-1" value={mapIds.split(",").filter(Boolean)} onChange={(e) => setMapIds([...e.target.selectedOptions].map((o) => o.value).join(","))}>{emps.data?.data?.filter((x) => !d.mapped.some((mm) => mm.employeeId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeCode})</option>)}</select><Button size="sm" disabled={!mapIds} loading={act.isPending} onClick={() => act.mutate({ url: `/devices/${d.id}/employees`, body: { employeeIds: mapIds.split(",") } }, { onSuccess: () => setMapIds("") })}>Map</Button></div>}
            <div className="max-h-56 overflow-y-auto card">{!d.mapped.length ? <p className="p-3 text-sm text-muted">No employees mapped. Map employees so punches match records.</p> : <table className="w-full"><tbody>{d.mapped.map((x) => <tr key={x.id}><td className="td">{x.name}<div className="text-xs text-muted">{x.employeeCode}</div></td><td className="td font-mono text-xs">UID {x.deviceUserId}</td><td className="td">{x.syncedToDevice ? <Badge status="active">on device</Badge> : <Badge status="pending">pending</Badge>}</td><td className="td text-right">{can("device.manage") && <Button size="sm" variant="ghost" onClick={() => act.mutate({ method: "delete", url: `/devices/${d.id}/employees/${x.id}` })}>Unmap</Button>}</td></tr>)}</tbody></table>}</div></div>
          <div><h3 className="font-bold text-sm mb-2">Recent events</h3><div className="max-h-72 overflow-y-auto card divide-y divide-line">{!d.logs.length ? <p className="p-3 text-sm text-muted">No events yet.</p> : d.logs.map((l) => <div key={l.id} className="px-3 py-2 text-sm flex gap-3"><span className={cn("shrink-0 w-2 h-2 mt-1.5 rounded-full", l.level === "error" ? "bg-danger" : l.level === "warn" ? "bg-warn" : "bg-good")} /><span className="flex-1"><span className="font-semibold">{l.event}</span> {l.message}</span><span className="text-xs text-muted whitespace-nowrap">{ago(l.createdAt)}</span></div>)}</div></div>
        </div>
      </div>; })()}</Modal>

      <Modal open={setup} onClose={() => setSetup(false)} title="Hardware agent setup" wide><div className="space-y-4 text-sm">
        <p>The agent is a small program that runs on any Windows/Linux PC in the same network as your devices. It talks to devices and syncs punches to HRMS — even when internet drops, punches queue locally and sync later.</p>
        <div className="card p-4 space-y-2"><div className="font-bold">1. Agent key</div>
          {key.data?.data?.agentKey ? <div className="flex items-center gap-2"><code className="field flex-1 font-mono text-xs py-2 h-auto break-all">{key.data.data.agentKey}</code><Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(key.data!.data!.agentKey!); toast("Copied"); }}><Copy size={13} /></Button></div> : <p className="text-muted">No key yet.</p>}
          <Button size="sm" variant="ghost" loading={keyAct.isPending} onClick={() => confirm("Rotating the key will disconnect running agents until updated. Continue?") && keyAct.mutate({ url: "/devices/agent-key/rotate" })}>{key.data?.data?.agentKey ? "Rotate key" : "Generate key"}</Button></div>
        <div className="card p-4 space-y-2"><div className="font-bold">2. Run the agent</div><pre className="rounded-md bg-side text-side-ink p-3 text-xs overflow-x-auto">{`cd apps/hardware-agent
cp .env.example .env     # set BACKEND_URL and HARDWARE_AGENT_KEY
pnpm install && pnpm dev # or pnpm build && pnpm start`}</pre><p className="text-muted">For TCP devices (ZKTeco/eSSL 4370) also run <code>pnpm add node-zklib</code> inside apps/hardware-agent.</p></div>
        <div className="card p-4 space-y-1"><div className="font-bold">3. Connect devices</div><p><b>Push / ADMS mode (recommended):</b> on the device, Comm → Cloud Server → server = agent PC's IP, port = 5001. Add the device here with brand "ADMS / Push" and its serial number.</p><p><b>TCP mode:</b> add the device with its IP and port 4370; the agent polls it.</p><p>Then map employees to the device and click <b>Push users</b> — the employee list goes to the device.</p></div>
      </div></Modal>
    </>
  );
}
