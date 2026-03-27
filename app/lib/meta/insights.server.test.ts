import { describe, expect, it } from "vitest";
import {
  computeCpl,
  parseInsightRow,
  type CampaignInsightRow,
} from "~/lib/meta/insights.server";

describe("computeCpl", () => {
  it("devuelve 0 si no hay leads", () => {
    expect(computeCpl(100, 0)).toBe("0");
    expect(computeCpl(100, -1)).toBe("0");
  });

  it("divide spend entre leads", () => {
    expect(computeCpl(50, 10)).toBe("5.0000");
    expect(computeCpl(33.33, 3)).toBe("11.1100");
  });
});

describe("parseInsightRow", () => {
  it("parsea fila Meta típica", () => {
    const row: CampaignInsightRow = {
      campaign_id: "123",
      spend: "12.50",
      impressions: "1000",
      clicks: "42",
      actions: [
        { action_type: "lead", value: "5" },
        { action_type: "link_click", value: "10" },
      ],
    };
    const out = parseInsightRow(row);
    expect(out.spend).toBe(12.5);
    expect(out.impressions).toBe(1000);
    expect(out.clicks).toBe(42);
    expect(out.leads).toBe(5);
    expect(out.cpl).toBe("2.5000");
  });
});
