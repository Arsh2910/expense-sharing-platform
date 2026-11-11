import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { generateAccessToken } from "./token.service.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMAIL_ALREADY_EXISTS"
      | "INVALID_CREDENTIALS"
      | "ACCOUNT_UNAVAILABLE",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

export async function registerUser(input: RegisterInput) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      user,
      accessToken: generateAccessToken(user.id),
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AuthServiceError(
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    throw error;
  }
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      email: input.email,
    },
  });

  if (!user) {
    throw new AuthServiceError(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AuthServiceError(
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  if (user.status !== "ACTIVE") {
    throw new AuthServiceError("Account unavailable", "ACCOUNT_UNAVAILABLE");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt,
    },
    accessToken: generateAccessToken(user.id),
  };
}
