import type { Prisma } from "../../generated/prisma/client.js";

export class InvalidClientTimeZoneError extends Error {}

export async function transactionCalendarDate(
  tx: Prisma.TransactionClient,
  clientTimeZone = "UTC",
) {
  if (!/^[A-Za-z][A-Za-z0-9_+/-]{0,99}$/.test(clientTimeZone)) {
    throw new InvalidClientTimeZoneError("Invalid X-Client-Time-Zone");
  }
  // Give the expense trigger the same calendar without changing how PostgreSQL
  // writes unrelated timestamps in this transaction.
  const [calendar] = await tx.$queryRaw<{ today: string }[]>`
    SELECT set_config('splitcircle.client_time_zone', name, true),
           to_char(transaction_timestamp() AT TIME ZONE name, 'YYYY-MM-DD') AS today
    FROM pg_timezone_names
    WHERE name = ${clientTimeZone}
  `;
  if (!calendar) throw new InvalidClientTimeZoneError("Invalid X-Client-Time-Zone");
  return calendar.today;
}
