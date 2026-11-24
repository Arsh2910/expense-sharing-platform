import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function encryptionKey() {
  const value = process.env.PASSWORD_RESET_OUTBOX_KEY;
  if (!value && process.env.NODE_ENV !== "production" && process.env.JWT_ACCESS_SECRET) {
    return createHmac("sha256", process.env.JWT_ACCESS_SECRET).update("expense-sharing/outbox-token/v1").digest();
  }
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("PASSWORD_RESET_OUTBOX_KEY must be a 32-byte hex key");
  }
  return Buffer.from(value, "hex");
}

export function encryptOutboxToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptOutboxToken(envelope: string) {
  const parts = envelope.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted email token");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length !== 43) {
    throw new Error("Invalid encrypted email token");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
