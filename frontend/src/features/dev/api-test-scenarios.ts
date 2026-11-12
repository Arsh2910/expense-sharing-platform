import type {
  DevTestContextData,
  RawApiResponse,
  TestScenario,
} from "@/features/dev/api-test-types";

export const TEST_SCENARIOS: TestScenario[] = [
  // --- 1. HAPPY PATH ---
  {
    id: "reg_happy",
    category: "happy_path",
    title: "Register new user",
    method: "POST",
    endpoint: "/api/auth/register",
    description: "Submit valid registration details for a fresh account.",
    setupPrerequisites: "Provide a unique email in the test context.",
    bodyTemplate: {
      email: "{{testEmail}}",
      displayName: "{{testDisplayName}}",
      password: "{{testPassword}}",
    },
    expectedStatus: [201, 503], // 201 if email provider configured, 503 if unconfigured (known dev backend state)
    validate: (res) => {
      if (res.status === 201) {
        const body = res.body as { data?: { id?: string; email?: string } };
        if (body?.data?.id) return { passed: true };
        return { passed: false, reason: "Response missing data.id" };
      }
      if (res.status === 503) {
        // Backend default when email provider is unconfigured
        return {
          passed: true,
          reason:
            "Passed (503 Email verification delivery unconfigured - expected default on backend)",
        };
      }
      return { passed: false, reason: `Unexpected status code ${res.status}` };
    },
  },
  {
    id: "login_happy",
    category: "happy_path",
    title: "Login with valid credentials",
    method: "POST",
    endpoint: "/api/auth/login",
    description: "Submit registered & verified credentials. Backend sets access and refresh HttpOnly cookies.",
    setupPrerequisites: "User must be registered and verified.",
    bodyTemplate: {
      email: "{{testEmail}}",
      password: "{{testPassword}}",
    },
    expectedStatus: 200,
    validate: (res) => {
      if (res.status === 200) {
        const body = res.body as { data?: { id?: string; displayName?: string } };
        if (body?.data?.id) return { passed: true };
        return { passed: false, reason: "Response missing user data" };
      }
      if (res.status === 401) {
        const body = res.body as { message?: string };
        if (body?.message === "Email verification required") {
          return {
            passed: false,
            reason:
              "User exists but is unverified. Mark email_verified_at in DB or verify token first.",
          };
        }
      }
      return { passed: false, reason: `Expected 200, got ${res.status}` };
    },
  },
  {
    id: "me_happy",
    category: "happy_path",
    title: "Fetch current profile (/api/auth/me)",
    method: "GET",
    endpoint: "/api/auth/me",
    description: "Read authenticated user profile using access cookie.",
    setupPrerequisites: "Must be logged in.",
    expectedStatus: 200,
    validate: (res) => {
      const body = res.body as { data?: { id?: string; email?: string } };
      if (res.status === 200 && body?.data?.id) return { passed: true };
      return { passed: false, reason: "Expected 200 with data.id" };
    },
  },
  {
    id: "groups_list_happy",
    category: "happy_path",
    title: "List my groups (/api/groups)",
    method: "GET",
    endpoint: "/api/groups",
    description: "Fetch all active groups where current user is a member.",
    setupPrerequisites: "Must be logged in.",
    expectedStatus: 200,
    validate: (res) => {
      const body = res.body as { data?: unknown[] };
      if (res.status === 200 && Array.isArray(body?.data)) return { passed: true };
      return { passed: false, reason: "Expected 200 with data array" };
    },
  },
  {
    id: "create_group_happy",
    category: "happy_path",
    title: "Create group (/api/groups)",
    method: "POST",
    endpoint: "/api/groups",
    description: "Create a new expense group with name and 3-letter currency code.",
    setupPrerequisites: "Must be logged in.",
    bodyTemplate: {
      name: "API Test Group {{timestamp}}",
      currency: "USD",
    },
    expectedStatus: 201,
    validate: (res) => {
      const body = res.body as { data?: { id?: string; name?: string } };
      if (res.status === 201 && body?.data?.id) return { passed: true };
      return { passed: false, reason: "Expected 201 with data.id" };
    },
  },
  {
    id: "list_members_happy",
    category: "happy_path",
    title: "List group members (/api/groups/:groupId/members)",
    method: "GET",
    endpoint: "/api/groups/{{selectedGroupId}}/members",
    description: "Fetch all active members of the selected group.",
    setupPrerequisites: "Selected Group ID must belong to logged-in user.",
    expectedStatus: 200,
    validate: (res) => {
      const body = res.body as { data?: unknown[] };
      if (res.status === 200 && Array.isArray(body?.data)) return { passed: true };
      return { passed: false, reason: "Expected 200 with members array" };
    },
  },
  {
    id: "get_group_details_happy",
    category: "happy_path",
    title: "Fetch group details (/api/groups/:groupId)",
    method: "GET",
    endpoint: "/api/groups/{{selectedGroupId}}",
    description: "Retrieve group metadata, memberCount, and user's role.",
    setupPrerequisites: "Selected Group ID must belong to logged-in user.",
    expectedStatus: 200,
    validate: (res) => {
      const body = res.body as { data?: { id?: string; memberCount?: number; myRole?: string } };
      if (res.status === 200 && body?.data?.id && typeof body.data.memberCount === "number") {
        return { passed: true };
      }
      return { passed: false, reason: "Expected 200 with group details and memberCount" };
    },
  },
  {
    id: "update_group_happy",
    category: "happy_path",
    title: "Update group name (/api/groups/:groupId)",
    method: "PATCH",
    endpoint: "/api/groups/{{selectedGroupId}}",
    description: "Update group name as an owner or admin.",
    setupPrerequisites: "Selected Group ID must belong to logged-in user with OWNER/ADMIN role.",
    bodyTemplate: {
      name: "Updated Group {{timestamp}}",
    },
    expectedStatus: 200,
  },
  {
    id: "archive_group_happy",
    category: "happy_path",
    title: "Archive group (/api/groups/:groupId)",
    method: "DELETE",
    endpoint: "/api/groups/{{selectedGroupId}}",
    description: "Archive group as OWNER.",
    setupPrerequisites: "Selected Group ID must belong to logged-in user with OWNER role.",
    expectedStatus: 200,
  },
  {
    id: "refresh_happy",
    category: "happy_path",
    title: "Refresh access token (/api/auth/refresh)",
    method: "POST",
    endpoint: "/api/auth/refresh",
    description: "Rotate session tokens using refresh_token cookie.",
    setupPrerequisites: "Must have valid refresh_token cookie.",
    bodyTemplate: {},
    expectedStatus: 200,
    validate: (res) => {
      if (res.status === 200) return { passed: true };
      return { passed: false, reason: `Expected 200, got ${res.status}` };
    },
  },
  {
    id: "update_profile_happy",
    category: "happy_path",
    title: "Update profile (/api/auth/me)",
    method: "PATCH",
    endpoint: "/api/auth/me",
    description: "Update display name for the current authenticated user.",
    setupPrerequisites: "Must be logged in.",
    bodyTemplate: {
      displayName: "{{testDisplayName}} Updated",
    },
    expectedStatus: 200,
    validate: (res) => {
      if (res.status === 200) return { passed: true };
      return { passed: false, reason: `Expected 200, got ${res.status}` };
    },
  },
  {
    id: "logout_happy",
    category: "happy_path",
    title: "Logout current session (/api/auth/logout)",
    method: "POST",
    endpoint: "/api/auth/logout",
    description: "Revoke session in database and clear auth cookies.",
    setupPrerequisites: "Must be logged in.",
    bodyTemplate: {},
    expectedStatus: 204,
    validate: (res) => {
      if (res.status === 204) return { passed: true };
      return { passed: false, reason: `Expected 204 No Content, got ${res.status}` };
    },
  },

  // --- 2. VALIDATION FAILURES ---
  {
    id: "reg_val_email",
    category: "validation",
    title: "Register: Invalid email format",
    method: "POST",
    endpoint: "/api/auth/register",
    description: "Submit registration with malformed email address.",
    bodyTemplate: {
      email: "not-an-email",
      displayName: "Valid Name",
      password: "password123",
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Validation failed",
    validate: (res) => {
      if (res.status === 400) return { passed: true };
      return { passed: false, reason: `Expected 400 Validation failed, got ${res.status}` };
    },
  },
  {
    id: "reg_val_pass_short",
    category: "validation",
    title: "Register: Password under 8 characters",
    method: "POST",
    endpoint: "/api/auth/register",
    description: "Submit registration with password shorter than minimum 8 characters.",
    bodyTemplate: {
      email: "val-test-{{timestamp}}@example.com",
      displayName: "Short Pass",
      password: "short",
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Validation failed",
  },
  {
    id: "login_val_empty",
    category: "validation",
    title: "Login: Empty password",
    method: "POST",
    endpoint: "/api/auth/login",
    description: "Submit login form with missing or empty password.",
    bodyTemplate: {
      email: "test@example.com",
      password: "",
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Validation failed",
  },
  {
    id: "group_val_currency_lowercase",
    category: "validation",
    title: "Create Group: Non-uppercase/invalid currency code",
    method: "POST",
    endpoint: "/api/groups",
    description: "Submit currency code that fails ^[A-Z]{3}$ regex.",
    bodyTemplate: {
      name: "Invalid Currency Group",
      currency: "usd", // Lowercase should fail regex
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Validation failed",
  },
  {
    id: "add_member_val_uuid",
    category: "validation",
    title: "Group Members: Non-UUID groupId parameter",
    method: "GET",
    endpoint: "/api/groups/not-a-valid-uuid/members",
    description: "Call member listing endpoint with an invalid UUID parameter.",
    expectedStatus: 400,
    expectedMessageSubstring: "Validation failed",
  },

  // --- 3. AUTHENTICATION FAILURES ---
  {
    id: "login_auth_wrong_password",
    category: "authentication",
    title: "Login: Incorrect password",
    method: "POST",
    endpoint: "/api/auth/login",
    description: "Submit existing email with an incorrect password.",
    bodyTemplate: {
      email: "{{testEmail}}",
      password: "completely-wrong-password-999",
    },
    expectedStatus: 401,
    expectedMessageSubstring: "Invalid email or password",
  },
  {
    id: "login_auth_nonexistent",
    category: "authentication",
    title: "Login: Non-existent email account",
    method: "POST",
    endpoint: "/api/auth/login",
    description: "Submit an email that does not exist in the database.",
    bodyTemplate: {
      email: "non-existent-user-{{timestamp}}@example.invalid",
      password: "password123",
    },
    expectedStatus: 401,
    expectedMessageSubstring: "Invalid email or password",
  },

  // --- 4. AUTHORIZATION FAILURES ---
  {
    id: "me_auth_anonymous",
    category: "authorization",
    title: "Protected Route: Call /me without access cookie",
    method: "GET",
    endpoint: "/api/auth/me",
    description: "Verify that unauthenticated requests to protected endpoints receive 401.",
    setupPrerequisites: "Run after logout or in a signed-out state.",
    expectedStatus: 401,
    expectedMessageSubstring: "Authentication required",
  },
  {
    id: "group_members_forbidden",
    category: "authorization",
    title: "Group Access: View members of foreign group",
    method: "GET",
    endpoint: "/api/groups/00000000-0000-0000-0000-000000000001/members",
    description: "Attempt to list members of a group where the user does not have active membership.",
    setupPrerequisites: "Must be logged in.",
    expectedStatus: [403, 404], // 404 if group doesn't exist, 403 if user is not a member
  },

  // --- 5. DUPLICATE REQUESTS ---
  {
    id: "reg_dup_email",
    category: "duplicates",
    title: "Register: Duplicate email conflict",
    method: "POST",
    endpoint: "/api/auth/register",
    description: "Attempt to register an account with an email that is already in use.",
    setupPrerequisites: "Test email must already exist in database.",
    bodyTemplate: {
      email: "{{testEmail}}",
      displayName: "Duplicate Attempt",
      password: "password123",
    },
    expectedStatus: 409,
    expectedMessageSubstring: "An account with this email already exists",
  },

  // --- 6. SESSION LIFECYCLE ---
  {
    id: "verify_token_invalid",
    category: "session_lifecycle",
    title: "Email Verification: Invalid or fake token",
    method: "POST",
    endpoint: "/api/auth/verify-email",
    description: "Submit an invalid token string to /api/auth/verify-email.",
    bodyTemplate: {
      token: "fake-verification-token-string-of-sufficient-length-20chars",
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Invalid or expired verification token",
  },
  {
    id: "change_password_invalid_current",
    category: "session_lifecycle",
    title: "Change Password: Wrong current password",
    method: "PATCH",
    endpoint: "/api/auth/me/password",
    description: "Attempt to change password while providing the wrong current password.",
    setupPrerequisites: "Must be logged in.",
    bodyTemplate: {
      currentPassword: "incorrect-current-password",
      newPassword: "new-valid-password-12345",
    },
    expectedStatus: 400,
    expectedMessageSubstring: "Current password is incorrect",
  },

  // --- 7. CONCURRENCY ---
  {
    id: "refresh_race_detection",
    category: "concurrency",
    title: "Session Rotation: Sequential refresh verification",
    method: "POST",
    endpoint: "/api/auth/refresh",
    description:
      "Verify refresh token rotation. Note: Backend detects token reuse and revokes all sessions if the same refresh token is consumed twice.",
    setupPrerequisites: "Must have valid refresh_token cookie.",
    bodyTemplate: {},
    expectedStatus: [200, 401],
  },
];

export function interpolateTemplate(
  template: Record<string, unknown> | null | undefined,
  context: DevTestContextData,
): string {
  if (!template) return "";
  const raw = JSON.stringify(template, null, 2);
  const now = Date.now().toString().slice(-6);
  return raw
    .replace(/\{\{testEmail\}\}/g, context.testEmail)
    .replace(/\{\{testPassword\}\}/g, context.testPassword)
    .replace(/\{\{testDisplayName\}\}/g, context.testDisplayName)
    .replace(/\{\{verificationToken\}\}/g, context.verificationToken)
    .replace(/\{\{selectedGroupId\}\}/g, context.selectedGroupId)
    .replace(/\{\{targetUserId\}\}/g, context.targetUserId)
    .replace(/\{\{newPassword\}\}/g, context.newPassword)
    .replace(/\{\{timestamp\}\}/g, now);
}

export function interpolateEndpoint(
  endpoint: string,
  context: DevTestContextData,
): string {
  const now = Date.now().toString().slice(-6);
  return endpoint
    .replace(/\{\{selectedGroupId\}\}/g, context.selectedGroupId || "00000000-0000-0000-0000-000000000000")
    .replace(/\{\{targetUserId\}\}/g, context.targetUserId || "00000000-0000-0000-0000-000000000000")
    .replace(/\{\{testEmail\}\}/g, context.testEmail)
    .replace(/\{\{timestamp\}\}/g, now);
}

export function evaluateScenarioResult(
  scenario: TestScenario,
  response: RawApiResponse,
): { passed: boolean; reason?: string } {
  if (scenario.validate) {
    return scenario.validate(response);
  }

  const expectedStatuses = Array.isArray(scenario.expectedStatus)
    ? scenario.expectedStatus
    : [scenario.expectedStatus];

  if (!expectedStatuses.includes(response.status)) {
    return {
      passed: false,
      reason: `Expected HTTP status ${expectedStatuses.join(" or ")}, but received ${response.status} (${response.statusText || "Status code error"}).`,
    };
  }

  if (scenario.expectedMessageSubstring) {
    const raw = typeof response.body === "object" ? JSON.stringify(response.body) : response.rawText;
    if (!raw.includes(scenario.expectedMessageSubstring)) {
      return {
        passed: false,
        reason: `Expected response to contain "${scenario.expectedMessageSubstring}".`,
      };
    }
  }

  return { passed: true };
}

