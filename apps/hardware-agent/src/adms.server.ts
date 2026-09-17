import type { Express } from "express";
import express from "express";
import { AdmsAdapter } from "./adapters/adms.js";

/**
 * ZKTeco ADMS (iclock) protocol receiver. Device hits:
 *   GET  /iclock/cdata?SN=xxx&options=all   → handshake
 *   POST /iclock/cdata?SN=xxx&table=ATTLOG  → punches (tab-separated: PIN\tTIME\tSTATUS\tVERIFY...)
 *   GET  /iclock/getrequest?SN=xxx          → device asks for commands (we push user DATA here)
 *   POST /iclock/devicecmd                  → command results
 */
export function mountAdms(app: Express) {
  app.use("/iclock", express.text({ type: "*/*", limit: "5mb" }));
  app.get("/iclock/cdata", (req, res) => {
    const sn = String(req.query.SN ?? ""); const a = AdmsAdapter.bySerial.get(sn);
    if (a) a.lastContact = Date.now();
    res.type("text/plain").send(`GET OPTION FROM: ${sn}\r\nATTLOGStamp=None\r\nOPERLOGStamp=9999\r\nATTPHOTOStamp=None\r\nErrorDelay=30\r\nDelay=10\r\nTransTimes=00:00;14:05\r\nTransInterval=1\r\nTransFlag=TransData AttLog OpLog\r\nTimeZone=5.5\r\nRealtime=1\r\nEncrypt=None\r\n`);
  });
  app.post("/iclock/cdata", (req, res) => {
    const sn = String(req.query.SN ?? ""); const table = String(req.query.table ?? "");
    const a = AdmsAdapter.bySerial.get(sn);
    if (!a) { console.warn(`ADMS: unknown device SN=${sn} — add it in HRMS with brand 'adms'`); return res.type("text/plain").send("OK"); }
    if (table === "ATTLOG") {
      const lines = String(req.body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const punches = lines.map((l) => { const [pin, time, status] = l.split("\t"); return { deviceSerial: sn, deviceUserId: String(pin).trim(), punchedAt: new Date(time.replace(" ", "T") + "+05:30").toISOString(), type: (status === "0" ? "in" : status === "1" ? "out" : "unknown") as "in" | "out" | "unknown" }; }).filter((p) => !isNaN(Date.parse(p.punchedAt)));
      a.receive(punches);
      return res.type("text/plain").send(`OK: ${punches.length}`);
    }
    a.lastContact = Date.now();
    res.type("text/plain").send("OK");
  });
  app.get("/iclock/getrequest", (req, res) => {
    const sn = String(req.query.SN ?? ""); const a = AdmsAdapter.bySerial.get(sn);
    if (!a) return res.type("text/plain").send("OK");
    a.lastContact = Date.now();
    if (a.pendingUsers.length) {
      const cmds = a.pendingUsers.map((u, i) => `C:${i + 1}:DATA USER PIN=${u.deviceUserId}\tName=${u.name.slice(0, 24)}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`).join("\r\n");
      a.pendingUsers = [];
      return res.type("text/plain").send(cmds + "\r\n");
    }
    res.type("text/plain").send("OK");
  });
  app.post("/iclock/devicecmd", (_req, res) => res.type("text/plain").send("OK"));
}
