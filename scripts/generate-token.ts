import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      emailVerifiedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (users.length === 0) {
    console.log("No users found in the database. Please register an account first on http://localhost:5173/register");
    return;
  }

  console.log("\nRegistered Users:");
  users.forEach((u, i) => {
    const verified = u.emailVerifiedAt ? `Verified (${u.emailVerifiedAt.toISOString()})` : "NOT VERIFIED";
    console.log(`[${i + 1}] ${u.email} (${u.displayName}) - ${verified}`);
  });

  const selectedUser = targetEmail
    ? users.find((u) => u.email === targetEmail)
    : users[0];

  if (!selectedUser) {
    console.log(`\nUser with email "${targetEmail}" not found.`);
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  await prisma.verificationToken.create({
    data: {
      userId: selectedUser.id,
      tokenHash,
      purpose: "EMAIL",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  console.log("\n=======================================================");
  console.log(`Generated verification token for: ${selectedUser.email}`);
  console.log("=======================================================");
  console.log(`Token:\n${token}`);
  console.log("\nDirect Verification Link (click to verify automatically):");
  console.log(`http://localhost:5173/verify-email?token=${token}`);
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

