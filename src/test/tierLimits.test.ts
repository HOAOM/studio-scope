import { describe, it, expect } from "vitest";
import { describeTierError, formatBytes, UPGRADE_HINT } from "@/lib/tierLimits";

describe("tierLimits — messaggi di limite piano", () => {
  it("propaga i messaggi di limite generati dai trigger DB", () => {
    expect(describeTierError(new Error("Limite posti raggiunto per il piano"))).toMatch(/Limite posti/);
    expect(describeTierError(new Error("Limite progetti attivi raggiunto"))).toMatch(/Limite progetti/);
    expect(describeTierError(new Error("Limite voci BOQ raggiunto"))).toMatch(/Limite voci/);
  });

  it("traduce il rifiuto RLS dello storage in messaggio di quota", () => {
    const msg = describeTierError(new Error('new row violates row-level security policy for table "objects"'));
    expect(msg).toContain("Spazio di archiviazione esaurito");
    expect(msg).toContain(UPGRADE_HINT);
  });

  it("non lascia mai un messaggio vuoto", () => {
    expect(describeTierError(null)).toBe("Operazione non riuscita.");
  });
});

describe("tierLimits — formatBytes", () => {
  it("formatta le taglie e rappresenta l'illimitato", () => {
    expect(formatBytes(null)).toBe("∞");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.0 GB");
    expect(formatBytes(10 * 1024 ** 3)).toBe("10 GB");
  });
});
