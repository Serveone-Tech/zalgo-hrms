// Section 69–72: pure salary math. DB access payroll.service mein.
export type Component = { id: string; code: string; name: string; type: "earning" | "deduction"; calc: "fixed" | "percent_basic" | "percent_gross"; isProrated: boolean; isStatutory: boolean; isTaxable: boolean };
export type Structure = { components: { componentId: string; code: string; value: number }[]; pfOptIn: boolean; esiOptIn: boolean; ptApplicable: boolean; tdsMonthly: number };
export type Statutory = {
  pf: { enabled: boolean; employeePct: number; employerPct: number; wageCeiling: number; restrictToCeiling: boolean };
  esi: { enabled: boolean; employeePct: number; employerPct: number; grossCeiling: number };
  pt: { enabled: boolean; slabs: { upto: number; amount: number }[] }; // monthly gross slabs; last slab upto=Infinity
  roundNet: boolean;
};
export const DEFAULT_STATUTORY: Statutory = {
  pf: { enabled: true, employeePct: 12, employerPct: 12, wageCeiling: 15000, restrictToCeiling: true },
  esi: { enabled: true, employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 },
  pt: { enabled: true, slabs: [{ upto: 15000, amount: 0 }, { upto: 20000, amount: 150 }, { upto: Infinity, amount: 200 }] }, // MP-style default; company settings se override
  roundNet: true,
};
const r2 = (n: number) => Math.round(n * 100) / 100;

// Full-month earnings from structure (fixed + percent components resolved in order: basic → percent_basic → percent_gross)
export function fullEarnings(structure: Structure, comps: Component[]) {
  const byId = new Map(comps.map((c) => [c.id, c]));
  const rows = structure.components.map((s) => ({ c: byId.get(s.componentId)!, value: s.value })).filter((x) => x.c && x.c.type === "earning" && !x.c.isStatutory);
  const basic = rows.find((x) => x.c.code === "BASIC")?.value ?? 0;
  let fixedGross = rows.filter((x) => x.c.calc === "fixed").reduce((a, x) => a + x.value, 0);
  const pctBasic = rows.filter((x) => x.c.calc === "percent_basic").map((x) => ({ c: x.c, amount: r2((basic * x.value) / 100) }));
  fixedGross += pctBasic.reduce((a, x) => a + x.amount, 0);
  const pctGross = rows.filter((x) => x.c.calc === "percent_gross").map((x) => ({ c: x.c, amount: r2((fixedGross * x.value) / 100) }));
  const out = [
    ...rows.filter((x) => x.c.calc === "fixed").map((x) => ({ code: x.c.code, name: x.c.name, full: x.value, prorated: x.c.isProrated })),
    ...pctBasic.map((x) => ({ code: x.c.code, name: x.c.name, full: x.amount, prorated: x.c.isProrated })),
    ...pctGross.map((x) => ({ code: x.c.code, name: x.c.name, full: x.amount, prorated: x.c.isProrated })),
  ];
  return out;
}
export function fixedDeductions(structure: Structure, comps: Component[]) {
  const byId = new Map(comps.map((c) => [c.id, c]));
  return structure.components.map((s) => ({ c: byId.get(s.componentId)!, value: s.value })).filter((x) => x.c && x.c.type === "deduction" && !x.c.isStatutory).map((x) => ({ code: x.c.code, name: x.c.name, amount: x.value }));
}

export function computePay(opts: { structure: Structure; comps: Component[]; statutory: Statutory; daysInMonth: number; payableDays: number; advanceRecovery?: number; overtimeAmount?: number }) {
  const { structure, comps, statutory: st, daysInMonth, payableDays } = opts;
  const factor = Math.max(0, Math.min(1, payableDays / daysInMonth));
  const earnings = fullEarnings(structure, comps).map((e) => ({ code: e.code, name: e.name, full: e.full, amount: r2(e.prorated ? e.full * factor : e.full) }));
  if (opts.overtimeAmount) earnings.push({ code: "OT", name: "Overtime", full: opts.overtimeAmount, amount: r2(opts.overtimeAmount) });
  const gross = r2(earnings.reduce((a, e) => a + e.amount, 0));
  const basicPaid = earnings.find((e) => e.code === "BASIC")?.amount ?? 0;
  const basicFull = earnings.find((e) => e.code === "BASIC")?.full ?? 0;
  const deductions: { code: string; name: string; amount: number }[] = []; const employer: { code: string; name: string; amount: number }[] = [];
  // PF (Section 71): 12% of basic (+DA), optional ceiling 15,000
  if (st.pf.enabled && structure.pfOptIn && basicPaid > 0) {
    const wage = st.pf.restrictToCeiling ? Math.min(basicPaid, st.pf.wageCeiling * factor) : basicPaid;
    deductions.push({ code: "PF", name: "Provident Fund", amount: Math.round((wage * st.pf.employeePct) / 100) });
    employer.push({ code: "PF_ER", name: "Employer PF", amount: Math.round((wage * st.pf.employerPct) / 100) });
  }
  // ESI: applicable if full-month gross ≤ ceiling
  const fullGross = earnings.reduce((a, e) => a + e.full, 0);
  if (st.esi.enabled && structure.esiOptIn && fullGross <= st.esi.grossCeiling && gross > 0) {
    deductions.push({ code: "ESI", name: "ESI", amount: Math.ceil((gross * st.esi.employeePct) / 100) });
    employer.push({ code: "ESI_ER", name: "Employer ESI", amount: Math.ceil((gross * st.esi.employerPct) / 100) });
  }
  // Professional tax slab on gross
  if (st.pt.enabled && structure.ptApplicable && gross > 0) {
    const slab = st.pt.slabs.find((s) => gross <= (s.upto ?? Infinity)) ?? st.pt.slabs[st.pt.slabs.length - 1];
    if (slab && slab.amount > 0) deductions.push({ code: "PT", name: "Professional Tax", amount: slab.amount });
  }
  if (structure.tdsMonthly > 0) deductions.push({ code: "TDS", name: "TDS", amount: r2(structure.tdsMonthly) });
  deductions.push(...fixedDeductions(structure, comps));
  if (opts.advanceRecovery) deductions.push({ code: "ADV", name: "Advance / Loan recovery", amount: r2(opts.advanceRecovery) });
  const totalDeductions = r2(deductions.reduce((a, d) => a + d.amount, 0));
  let net = r2(gross - totalDeductions); if (st.roundNet) net = Math.round(net);
  const employerCost = r2(gross + employer.reduce((a, e) => a + e.amount, 0));
  return { earnings, deductions, employer, gross, totalDeductions, net: Math.max(0, net), employerCost, factor, basicFull };
}
