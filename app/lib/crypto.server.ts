import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKeyHexForVersion } from "~/lib/env.server";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CURRENT_KEY_VERSION = 1;

/** Prefijo estable en `meta_connections.access_token_encrypted` */
const PAYLOAD_PREFIX = "a1:";

/**
 * Cifra texto con AES-256-GCM. Formato: `a1:{version}:{base64(iv || tag || ciphertext)}`
 */
export function encryptMetaAccessToken(plaintext: string): {
  stored: string;
  encryption_key_version: number;
} {
  const version = CURRENT_KEY_VERSION;
  const keyHex = getEncryptionKeyHexForVersion(version);
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Invalid encryption key length");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]);
  return {
    stored: `${PAYLOAD_PREFIX}${version}:${combined.toString("base64")}`,
    encryption_key_version: version,
  };
}

export function decryptMetaAccessToken(stored: string): string {
  if (!stored.startsWith(PAYLOAD_PREFIX)) {
    throw new Error("Unsupported encrypted token format");
  }
  const rest = stored.slice(PAYLOAD_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon === -1) throw new Error("Invalid encrypted token format");
  const version = Number.parseInt(rest.slice(0, colon), 10);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("Invalid encryption version");
  }
  const b64 = rest.slice(colon + 1);
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext length");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const keyHex = getEncryptionKeyHexForVersion(version);
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
