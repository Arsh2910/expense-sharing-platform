export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type TestCategory =
  | "happy_path"
  | "validation"
  | "authentication"
  | "authorization"
  | "duplicates"
  | "session_lifecycle"
  | "concurrency";

export interface RawApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  rawText: string;
  ok: boolean;
}

export interface TestResult {
  passed: boolean;
  actualStatus: number;
  durationMs: number;
  response: RawApiResponse;
  failureReason?: string;
  executedAt: string;
}

export interface TestScenario {
  id: string;
  title: string;
  category: TestCategory;
  method: HttpMethod;
  endpoint: string; // May contain placeholders like :groupId
  description: string;
  setupPrerequisites?: string;
  bodyTemplate?: Record<string, unknown> | null;
  expectedStatus: number | number[];
  expectedMessageSubstring?: string;
  validate?: (response: RawApiResponse) => { passed: boolean; reason?: string };
}

export interface DevTestContextData {
  testEmail: string;
  testPassword: string;
  testDisplayName: string;
  verificationToken: string;
  selectedGroupId: string;
  targetUserId: string;
  newPassword: string;
}

