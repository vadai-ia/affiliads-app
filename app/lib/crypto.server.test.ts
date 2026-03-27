import { describe, expect, it } from "vitest";
import { decryptMetaAccessToken, encryptMetaAccessToken } from "~/lib/crypto.server";

describe("encryptMetaAccessToken / decryptMetaAccessToken", () => {
  it("roundtrips texto largo", () => {
    const plain = "EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    const { stored } = encryptMetaAccessToken(plain);
    expect(stored.startsWith("a1:")).toBe(true);
    expect(decryptMetaAccessToken(stored)).toBe(plain);
  });

  it("rechaza formato desconocido", () => {
    expect(() => decryptMetaAccessToken("no-prefix")).toThrow(
      "Unsupported encrypted token format",
    );
  });
});
