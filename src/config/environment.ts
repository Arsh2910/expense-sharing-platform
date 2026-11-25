import { isIP } from "node:net";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
  JWT_ACCESS_SECRET: z.string().trim().min(1).optional(),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  APP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().trim().min(1).optional(),
  PASSWORD_RESET_OUTBOX_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  OAUTH_API_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().trim().min(1).optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().trim().min(1).optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().trim().min(1).optional(),
});

export function browserOrigins(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const urls = [
    ...(production ? [] : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5183",
      "http://127.0.0.1:5183",
    ]),
    ...[env.APP_BASE_URL, ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ];
  return new Set(urls.map((value) => {
    const url = URL.parse(value);
    if (!url || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (production && url.protocol !== "https:")) {
      throw new Error("APP_BASE_URL and CORS_ALLOWED_ORIGINS must be HTTP origins (HTTPS in production)");
    }
    return url.origin;
  }));
}

export function trustedProxies(env: NodeJS.ProcessEnv = process.env) {
  const proxies = (env.TRUSTED_PROXY_IPS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const proxy of proxies) {
    const [address, prefix, extra] = proxy.split("/");
    const version = isIP(address);
    if (!version || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error("TRUSTED_PROXY_IPS must contain specific proxy IPs or CIDR ranges");
    }
  }
  return proxies;
}

export function validateEnvironment(service: "api" | "email-worker", env: NodeJS.ProcessEnv = process.env) {
  const normalized = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === "" ? undefined : value]));
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(", ");
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  const config = parsed.data;
  const required = new Set<keyof typeof config>();
  if (service === "api") {
    required.add("JWT_ACCESS_SECRET");
    for (const [id, secret] of [
      ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
      ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
    ] as const) {
      if (config[id] || config[secret]) {
        required.add(id);
        required.add(secret);
        required.add("OAUTH_API_ORIGIN");
        required.add("APP_BASE_URL");
      }
    }
    if (config.OAUTH_API_ORIGIN) {
      const url = new URL(config.OAUTH_API_ORIGIN);
      if (url.href !== `${url.origin}/` || (config.NODE_ENV === "production" && url.protocol !== "https:")) {
        throw new Error("OAUTH_API_ORIGIN must be an HTTP origin (HTTPS in production)");
      }
    }
  }
  if (service === "email-worker") {
    required.add("REDIS_URL");
    required.add("RESEND_API_KEY");
    required.add("RESEND_FROM_EMAIL");
  }
  if (config.NODE_ENV === "production") {
    required.add("APP_BASE_URL");
    required.add("PASSWORD_RESET_OUTBOX_KEY");
    if (service === "api") {
      required.add("REDIS_URL");
      if (config.JWT_ACCESS_SECRET && Buffer.byteLength(config.JWT_ACCESS_SECRET) < 32) {
        throw new Error("JWT_ACCESS_SECRET must be at least 32 bytes in production");
      }
    }
  } else if (service === "email-worker" && !config.PASSWORD_RESET_OUTBOX_KEY) {
    required.add("JWT_ACCESS_SECRET");
  }
  const missing = [...required].filter((key) => !config[key]);
  if (missing.length > 0) throw new Error(`Missing environment configuration: ${missing.join(", ")}`);
  browserOrigins(env);
  trustedProxies(env);
  return config;
}
