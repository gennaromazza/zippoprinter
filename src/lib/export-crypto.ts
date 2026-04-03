import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function parseKey(rawKey: string) {
  const trimmed = rawKey.trim();

  if (!trimmed) {
    throw new Error("EXPORT_SECRET_KEY non configurata.");
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const base64Buffer = Buffer.from(trimmed, "base64");
    if (base64Buffer.length === 32) {
      return base64Buffer;
    }
  } catch {
    // Fall back to utf8 parsing.
  }

  const utfBuffer = Buffer.from(trimmed, "utf8");
  if (utfBuffer.length === 32) {
    return utfBuffer;
  }

  throw new Error("EXPORT_SECRET_KEY deve essere lunga 32 byte (hex/base64/utf8).");
}

function getSecretKey() {
  return parseKey(process.env.EXPORT_SECRET_KEY || "");
}

export function encryptSecret(plainText: string) {
  const key = getSecretKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) {
    return "";
  }

  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Segreto cifrato non valido.");
  }

  const key = getSecretKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString("utf8");
}
