import { describe, it, expect } from "vitest";
import { parseTierLimitError, describeTierLimit } from "@/lib/tierError";

const detail = JSON.stringify({
  code: "TIER_LIMIT_REACHED",
  resource: "active_projects",
  current: 3,
  limit: 3,
  current_tier: "basic",
  suggested_tier: "advanced",
});

describe("tierError — errore strutturato di limite piano", () => {
  it("estrae il payload dal campo details di PostgREST", () => {
    const e = parseTierLimitError({ message: "Limite progetti attivi", details: detail });
    expect(e).not.toBeNull();
    expect(e!.resource).toBe("active_projects");
    expect(e!.suggested_tier).toBe("advanced");
  });

  it("estrae il payload anche se annegato nel messaggio", () => {
    const e = parseTierLimitError({ message: `errore: ${detail}` });
    expect(e?.code).toBe("TIER_LIMIT_REACHED");
  });

  it("ritorna null per errori normali", () => {
    expect(parseTierLimitError(new Error("boom"))).toBeNull();
    expect(parseTierLimitError(null)).toBeNull();
  });

  it("produce un messaggio leggibile con il piano suggerito", () => {
    const e = parseTierLimitError({ details: detail })!;
    expect(describeTierLimit(e)).toContain("piano advanced");
  });
});
