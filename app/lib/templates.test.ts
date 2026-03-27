import { describe, expect, it } from "vitest";
import { templatePayloadSchema } from "~/lib/templates";

const basePayload = {
  name: "Test",
  campaignObjective: "OUTCOME_LEADS" as const,
  copyBase: "Copy mínimo para pasar",
  minBudget: 100,
  maxBudget: 500,
  status: "draft" as const,
  assets: [
    {
      fileUrl: "https://example.com/a.jpg",
      storagePath: "org/x/a.jpg",
      fileType: "image" as const,
    },
  ],
  geos: [
    {
      label: "CDMX",
      countryCode: "MX",
      region: null,
      city: null,
      radiusKm: null,
    },
  ],
};

describe("templatePayloadSchema", () => {
  it("acepta payload válido", () => {
    const parsed = templatePayloadSchema.parse(basePayload);
    expect(parsed.name).toBe("Test");
  });

  it("falla si max < min", () => {
    expect(() =>
      templatePayloadSchema.parse({
        ...basePayload,
        minBudget: 500,
        maxBudget: 100,
      }),
    ).toThrow();
  });

  it("falla sin assets", () => {
    expect(() =>
      templatePayloadSchema.parse({
        ...basePayload,
        assets: [],
      }),
    ).toThrow();
  });
});
