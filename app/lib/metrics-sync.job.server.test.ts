import { describe, expect, it } from "vitest";
import {
  BUDGET_COMPLETE_THRESHOLD,
  parseBudgetMajor,
  todayDateStringMexico,
} from "~/lib/metrics-sync.job.server";

describe("parseBudgetMajor", () => {
  it("parsea números válidos", () => {
    expect(parseBudgetMajor("100.50")).toBe(100.5);
    expect(parseBudgetMajor("0")).toBe(0);
  });

  it("devuelve 0 si no es finito", () => {
    expect(parseBudgetMajor("")).toBe(0);
    expect(parseBudgetMajor("x")).toBe(0);
  });
});

describe("BUDGET_COMPLETE_THRESHOLD", () => {
  it("es 95%", () => {
    expect(BUDGET_COMPLETE_THRESHOLD).toBe(0.95);
  });
});

describe("todayDateStringMexico", () => {
  it("devuelve YYYY-MM-DD", () => {
    const s = todayDateStringMexico();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s)).toBe(true);
  });
});
