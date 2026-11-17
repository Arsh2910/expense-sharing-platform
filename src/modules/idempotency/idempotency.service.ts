import { createHash } from "node:crypto";
import { Prisma, type Prisma as PrismaTypes } from "../../../generated/prisma/client.js";

export type IdempotencyErrorCode = "KEY_REUSED" | "IN_PROGRESS";

export class IdempotencyServiceError extends Error {
  constructor(
    message: string,
    public readonly code: IdempotencyErrorCode,
  ) {
    super(message);
    this.name = "IdempotencyServiceError";
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(typeof value === "bigint" ? value.toString() : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashIdempotencyRequest(scope: string, payload: unknown): string {
  return createHash("sha256")
    .update(stableStringify({ scope, payload }))
    .digest("hex");
}

type IdempotencyResult = Readonly<{
  key?: string;
  replayResourceId?: string;
}>;

export async function beginIdempotency(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  scope: string,
  key: string | undefined,
  payload: unknown,
): Promise<IdempotencyResult> {
  if (!key) return {};

  const requestHash = hashIdempotencyRequest(scope, payload);
  const inserted = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
    INSERT INTO "idempotency_keys" ("user_id", "scope", "key", "request_hash", "status")
    VALUES (${userId}::uuid, ${scope}, ${key}, ${requestHash}, 'PENDING')
    ON CONFLICT ("user_id", "scope", "key") DO NOTHING
    RETURNING 1 AS id
  `);
  if (inserted.length > 0) return { key };

  const row = await tx.idempotencyKey.findUniqueOrThrow({
    where: { userId_scope_key: { userId, scope, key } },
    select: { requestHash: true, status: true, resourceId: true },
  });

  if (row.requestHash !== requestHash) {
    throw new IdempotencyServiceError(
      "This idempotency key was already used with a different request",
      "KEY_REUSED",
    );
  }
  if (row.status === "COMPLETED" && row.resourceId) {
    return { key, replayResourceId: row.resourceId };
  }
  throw new IdempotencyServiceError(
    "A request with this idempotency key is already in progress",
    "IN_PROGRESS",
  );
}

export async function completeIdempotency(
  tx: PrismaTypes.TransactionClient,
  userId: string,
  scope: string,
  key: string | undefined,
  resourceId: string,
) {
  if (!key) return;
  await tx.idempotencyKey.update({
    where: { userId_scope_key: { userId, scope, key } },
    data: { status: "COMPLETED", resourceId },
  });
}
