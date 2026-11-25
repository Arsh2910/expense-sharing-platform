import { parseArgs } from "node:util";
import { z } from "zod";
import { prisma } from "../src/lib/prisma.js";
import { diffGroupBalances } from "../src/modules/balances/balance.service.js";

try {
  const { values } = parseArgs({ options: { group: { type: "string" } } });
  const groupIds = values.group !== undefined
    ? [z.uuid().parse(values.group)]
    : (await prisma.group.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map(({ id }) => id);

  let mismatchCount = 0;
  for (const groupId of groupIds) {
    const { differences } = await diffGroupBalances(groupId);
    for (const { userId, live, rebuilt } of differences) {
      console.log(JSON.stringify({
        groupId,
        userId,
        liveMinor: live?.toString() ?? null,
        rebuiltMinor: rebuilt?.toString() ?? null,
      }));
      mismatchCount++;
    }
  }
  console.log(`Checked ${groupIds.length} group(s). Found ${mismatchCount} balance mismatch(es).`);
  process.exitCode = mismatchCount ? 1 : 0;
} catch (error) {
  const reason = error instanceof z.ZodError ? "Expected a valid group UUID."
    : error instanceof Error ? error.name : "Unknown error";
  console.error(`Could not check balances: ${reason}`);
  process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
