import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_ORDER,
  MACRO_PHASES,
  getMacroPhase,
  getAvailableTransitions,
  canAdvanceTo,
  canSeeCosts,
  computeProjectKPIs,
  addWorkingDays,
  mapLegacyStatus,
} from "@/lib/workflow";

describe("workflow — coerenza strutturale", () => {
  it("ogni stato del ciclo di vita appartiene a una macro-fase", () => {
    const covered = new Set(MACRO_PHASES.flatMap((p) => p.states as string[]));
    const orphans = LIFECYCLE_ORDER.filter((s) => !covered.has(s));
    expect(orphans).toEqual([]);
  });

  it("nessuno stato compare in due macro-fasi", () => {
    const all = MACRO_PHASES.flatMap((p) => p.states as string[]);
    expect(all.length).toBe(new Set(all).size);
  });

  it("mappa gli stati legacy su stati validi", () => {
    expect(mapLegacyStatus("draft")).toBe("concept");
    expect(mapLegacyStatus("ordered")).toBe("po_issued");
    expect(getMacroPhase("po_issued")).toBe("procurement");
    expect(getMacroPhase(null)).toBe("planning");
  });
});

describe("workflow — transizioni per ruolo", () => {
  it("un designer può avviare il design ma non approvare come HoD", () => {
    const asDesigner = getAvailableTransitions("finishes_approved_designer", ["designer"]).map((t) => t.to);
    expect(asDesigner).not.toContain("finishes_approved_hod");
    expect(getAvailableTransitions("concept", ["designer"]).map((t) => t.to)).toContain("in_design");
  });

  it("l'head_of_design può approvare le finiture", () => {
    const t = getAvailableTransitions("finishes_approved_designer", ["head_of_design"]).map((x) => x.to);
    expect(t).toContain("finishes_approved_hod");
  });

  it("admin e coo bypassano i gate di ruolo", () => {
    const all = getAvailableTransitions("finishes_approved_designer", ["admin"]).map((t) => t.to);
    expect(all).toContain("finishes_approved_hod");
    expect(all).toContain("cancelled");
    expect(getAvailableTransitions("concept", ["coo"]).length).toBeGreaterThan(0);
  });

  it("un client non ha alcuna transizione disponibile sul design", () => {
    expect(getAvailableTransitions("in_design", ["client"])).toEqual([]);
  });

  it("solo admin/coo possono cancellare un item", () => {
    expect(getAvailableTransitions("in_design", ["project_manager"]).map((t) => t.to)).not.toContain("cancelled");
    expect(getAvailableTransitions("in_design", ["admin"]).map((t) => t.to)).toContain("cancelled");
  });

  it("canAdvanceTo consente solo il passo successivo (o on_hold/cancelled)", () => {
    expect(canAdvanceTo("concept", "in_design")).toBe(true);
    expect(canAdvanceTo("concept", "po_issued")).toBe(false);
    expect(canAdvanceTo("in_design", "on_hold")).toBe(true);
    expect(canAdvanceTo(null, "concept")).toBe(true);
  });
});

describe("workflow — visibilità costi", () => {
  it("designer e client non vedono i costi", () => {
    expect(canSeeCosts(["designer"])).toBe(false);
    expect(canSeeCosts(["client"])).toBe(false);
  });

  it("i ruoli economici vedono i costi", () => {
    expect(canSeeCosts(["qs"])).toBe(true);
    expect(canSeeCosts(["accountant"])).toBe(true);
    expect(canSeeCosts(["admin"])).toBe(true);
  });

  it("un ruolo cumulato eredita la visibilità del ruolo più alto", () => {
    expect(canSeeCosts(["designer", "qs"])).toBe(true);
  });
});

describe("workflow — KPI e date", () => {
  it("calcola le percentuali per stato minimo raggiunto", () => {
    const k = computeProjectKPIs([
      { lifecycle_status: "closed" },
      { lifecycle_status: "in_design" },
      { lifecycle_status: "design_ready" },
      { lifecycle_status: "concept" },
    ]);
    expect(k.totalItems).toBe(4);
    expect(k.designApproved).toBe(50);
    expect(k.closed).toBe(25);
  });

  it("ignora gli item non attivi e regge la lista vuota", () => {
    expect(computeProjectKPIs([]).totalItems).toBe(0);
    expect(computeProjectKPIs([{ lifecycle_status: "closed", is_active: false }]).totalItems).toBe(0);
  });

  it("addWorkingDays salta sabato e domenica", () => {
    // venerdì 2026-08-21 + 1 giorno lavorativo = lunedì 2026-08-24
    expect(addWorkingDays(new Date("2026-08-21T00:00:00Z"), 1).getUTCDate()).toBe(24);
    // 12 giorni lavorativi = lead time standard delle quotazioni
    const d = addWorkingDays(new Date("2026-08-21T00:00:00Z"), 12);
    expect(d.getUTCDay()).not.toBe(0);
    expect(d.getUTCDay()).not.toBe(6);
  });
});
