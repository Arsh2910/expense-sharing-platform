import * as React from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Layers,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { executeRawApiRequest } from "@/features/dev/api-client-raw";
import {
  evaluateScenarioResult,
  interpolateEndpoint,
  interpolateTemplate,
  TEST_SCENARIOS,
} from "@/features/dev/api-test-scenarios";
import type {
  DevTestContextData,
  HttpMethod,
  RawApiResponse,
  TestCategory,
  TestResult,
  TestScenario,
} from "@/features/dev/api-test-types";
import { cn } from "@/lib/utils/cn";

const CATEGORY_LABELS: Record<TestCategory, string> = {
  happy_path: "Happy Path",
  validation: "Validation Failures",
  authentication: "Auth Failures",
  authorization: "Authorization",
  duplicates: "Duplicate Handling",
  session_lifecycle: "Session Lifecycle",
  concurrency: "Concurrency & Race",
};

interface PresetEndpoint {
  label: string;
  method: HttpMethod;
  path: string;
  defaultBody?: Record<string, unknown> | null;
}

const PRESET_ENDPOINTS: PresetEndpoint[] = [
  { label: "Fetch Me (GET /api/auth/me)", method: "GET", path: "/api/auth/me" },
  {
    label: "Register (POST /api/auth/register)",
    method: "POST",
    path: "/api/auth/register",
    defaultBody: {
      email: "newuser@example.com",
      displayName: "New User",
      password: "password123",
    },
  },
  {
    label: "Login (POST /api/auth/login)",
    method: "POST",
    path: "/api/auth/login",
    defaultBody: {
      email: "test4@mail.com",
      password: "password123",
    },
  },
  {
    label: "Refresh Session (POST /api/auth/refresh)",
    method: "POST",
    path: "/api/auth/refresh",
    defaultBody: {},
  },
  {
    label: "Verify Email (POST /api/auth/verify-email)",
    method: "POST",
    path: "/api/auth/verify-email",
    defaultBody: {
      token: "your-verification-token-string",
    },
  },
  {
    label: "Update Profile (PATCH /api/auth/me)",
    method: "PATCH",
    path: "/api/auth/me",
    defaultBody: {
      displayName: "Updated Name",
      username: "cool_handle",
    },
  },
  {
    label: "Change Password (PATCH /api/auth/me/password)",
    method: "PATCH",
    path: "/api/auth/me/password",
    defaultBody: {
      currentPassword: "password123",
      newPassword: "newpassword12345",
    },
  },
  {
    label: "Change Email (PATCH /api/auth/me/email)",
    method: "PATCH",
    path: "/api/auth/me/email",
    defaultBody: {
      email: "different-email@example.com",
      password: "password123",
    },
  },
  {
    label: "Logout Current Session (POST /api/auth/logout)",
    method: "POST",
    path: "/api/auth/logout",
    defaultBody: {},
  },
  {
    label: "Delete Account (DELETE /api/auth/me)",
    method: "DELETE",
    path: "/api/auth/me",
    defaultBody: {
      currentPassword: "password123",
    },
  },
  { label: "List Groups (GET /api/groups)", method: "GET", path: "/api/groups" },
  {
    label: "Create Group (POST /api/groups)",
    method: "POST",
    path: "/api/groups",
    defaultBody: {
      name: "Weekend Getaway",
      currency: "USD",
    },
  },
  {
    label: "Fetch Group Details (GET /api/groups/:groupId)",
    method: "GET",
    path: "/api/groups/{{selectedGroupId}}",
  },
  {
    label: "Update Group Settings (PATCH /api/groups/:groupId)",
    method: "PATCH",
    path: "/api/groups/{{selectedGroupId}}",
    defaultBody: {
      name: "Renamed Group",
    },
  },
  {
    label: "Archive Group (DELETE /api/groups/:groupId)",
    method: "DELETE",
    path: "/api/groups/{{selectedGroupId}}",
  },
  {
    label: "List Group Members (GET /api/groups/:groupId/members)",
    method: "GET",
    path: "/api/groups/{{selectedGroupId}}/members",
  },
  {
    label: "Add Group Member (POST /api/groups/:groupId/members)",
    method: "POST",
    path: "/api/groups/{{selectedGroupId}}/members",
    defaultBody: {
      email: "friend@example.com",
    },
  },
  {
    label: "Remove Member / Leave (DELETE /api/groups/:groupId/members/:userId)",
    method: "DELETE",
    path: "/api/groups/{{selectedGroupId}}/members/{{targetUserId}}",
  },
  {
    label: "Update Member Role (PATCH /api/groups/:groupId/members/:userId)",
    method: "PATCH",
    path: "/api/groups/{{selectedGroupId}}/members/{{targetUserId}}",
    defaultBody: {
      role: "ADMIN",
    },
  },
];

const UNSUPPORTED_ENDPOINTS = [
  {
    category: "Auth",
    name: "Logout all sessions",
    reason: "No dedicated endpoint. Note: Updating password (/api/auth/me/password) revokes all other sessions in the database.",
  },
  {
    category: "Auth",
    name: "List active sessions (GET /api/auth/sessions)",
    reason: "Prisma schema includes Session model, but Express route is not implemented.",
  },
  {
    category: "Auth",
    name: "Revoke specific session (DELETE /api/auth/sessions/:id)",
    reason: "Express endpoint is not implemented.",
  },
];

export function DevApiTestingPage() {
  const [activeTab, setActiveTab] = React.useState<"scenarios" | "manual" | "contracts">("scenarios");
  const [selectedCategory, setSelectedCategory] = React.useState<TestCategory | "all">("all");

  // Context test data
  const [contextData, setContextData] = React.useState<DevTestContextData>({
    testEmail: "test4@mail.com",
    testPassword: "password123",
    testDisplayName: "Test User",
    verificationToken: "",
    selectedGroupId: "",
    targetUserId: "",
    newPassword: "newpassword12345",
  });

  // Test results state
  const [results, setResults] = React.useState<Record<string, TestResult>>({});
  const [runningScenarioId, setRunningScenarioId] = React.useState<string | null>(null);
  const [batchRunning, setBatchRunning] = React.useState(false);

  // Manual Explorer state
  const [manualMethod, setManualMethod] = React.useState<HttpMethod>("GET");
  const [manualPath, setManualPath] = React.useState("/api/auth/me");
  const [manualBody, setManualBody] = React.useState("");
  const [manualResponse, setManualResponse] = React.useState<RawApiResponse | null>(null);
  const [manualIsLoading, setManualIsLoading] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSelectPreset = (preset: PresetEndpoint) => {
    setManualMethod(preset.method);
    setManualPath(interpolateEndpoint(preset.path, contextData));
    setManualBody(
      preset.defaultBody
        ? interpolateTemplate(preset.defaultBody, contextData)
        : "",
    );
  };

  const executeScenario = async (scenario: TestScenario): Promise<TestResult> => {
    const interpolatedPath = interpolateEndpoint(scenario.endpoint, contextData);
    let parsedBody: unknown = undefined;

    if (scenario.bodyTemplate) {
      const bodyStr = interpolateTemplate(scenario.bodyTemplate, contextData);
      if (bodyStr.trim()) {
        try {
          parsedBody = JSON.parse(bodyStr);
        } catch {
          parsedBody = bodyStr;
        }
      }
    }

    const response = await executeRawApiRequest({
      method: scenario.method,
      path: interpolatedPath,
      body: parsedBody,
    });

    const evaluation = evaluateScenarioResult(scenario, response);

    // Auto-update context from successful operations
    if (response.ok && typeof response.body === "object" && response.body !== null) {
      const respObj = response.body as { data?: { id?: string; email?: string } };
      if (scenario.endpoint === "/api/groups" && scenario.method === "POST" && respObj.data?.id) {
        setContextData((prev) => ({ ...prev, selectedGroupId: respObj.data!.id! }));
      }
    }

    const result: TestResult = {
      passed: evaluation.passed,
      actualStatus: response.status,
      durationMs: response.durationMs,
      response,
      failureReason: evaluation.reason,
      executedAt: new Date().toLocaleTimeString(),
    };

    setResults((prev) => ({ ...prev, [scenario.id]: result }));
    return result;
  };

  const handleRunSingle = async (scenario: TestScenario) => {
    setRunningScenarioId(scenario.id);
    try {
      await executeScenario(scenario);
    } finally {
      setRunningScenarioId(null);
    }
  };

  const handleRunAll = async () => {
    setBatchRunning(true);
    const toRun =
      selectedCategory === "all"
        ? TEST_SCENARIOS
        : TEST_SCENARIOS.filter((s) => s.category === selectedCategory);

    for (const scenario of toRun) {
      setRunningScenarioId(scenario.id);
      await executeScenario(scenario);
      // Small delay between requests to keep execution observable
      await new Promise((r) => setTimeout(r, 120));
    }
    setRunningScenarioId(null);
    setBatchRunning(false);
  };

  const handleManualSend = async () => {
    setManualIsLoading(true);
    let parsedBody: unknown = undefined;
    if (manualBody.trim()) {
      try {
        parsedBody = JSON.parse(manualBody);
      } catch {
        parsedBody = manualBody;
      }
    }

    try {
      const res = await executeRawApiRequest({
        method: manualMethod,
        path: manualPath,
        body: parsedBody,
      });
      setManualResponse(res);

      // Auto-extract group ID if list groups returned data
      if (manualPath === "/api/groups" && res.ok && Array.isArray((res.body as { data?: unknown[] })?.data)) {
        const firstGroup = (res.body as { data: Array<{ id: string }> }).data[0];
        if (firstGroup?.id && !contextData.selectedGroupId) {
          setContextData((prev) => ({ ...prev, selectedGroupId: firstGroup.id }));
        }
      }
    } finally {
      setManualIsLoading(false);
    }
  };

  const filteredScenarios = React.useMemo(() => {
    if (selectedCategory === "all") return TEST_SCENARIOS;
    return TEST_SCENARIOS.filter((s) => s.category === selectedCategory);
  }, [selectedCategory]);

  const stats = React.useMemo(() => {
    const list = Object.values(results);
    const passed = list.filter((r) => r.passed).length;
    const failed = list.filter((r) => !r.passed).length;
    return { total: list.length, passed, failed };
  }, [results]);

  return (
    <div className="space-y-6">
      {/* Dev Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E7E5E0] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">
              API Testing Workspace
            </h1>
            <Badge variant="warning" className="font-mono text-xs">
              DEV ONLY
            </Badge>
          </div>
          <p className="text-sm text-[#52525B]">
            Execute, verify, and inspect real Express backend API requests with HttpOnly cookies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResults({})}
            disabled={Object.keys(results).length === 0}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear Results
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunAll}
            disabled={batchRunning}
            isLoading={batchRunning}
          >
            <Play className="h-3.5 w-3.5" />
            Run {selectedCategory === "all" ? "All" : CATEGORY_LABELS[selectedCategory]} ({filteredScenarios.length})
          </Button>
        </div>
      </div>

      {/* Security & Cookie notice */}
      <Alert variant="info" className="text-xs">
        <div className="space-y-1">
          <p className="font-semibold text-[#18181B] flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#0F766E]" />
            HttpOnly Cookie Architecture
          </p>
          <p className="text-[#52525B] leading-relaxed">
            All requests are dispatched with <code className="bg-white px-1 py-0.5 rounded border border-[#E7E5E0]">credentials: "include"</code>.
            Because the backend uses secure <strong>HttpOnly</strong> cookies (<code className="text-[#0F766E]">access_token</code>, <code className="text-[#0F766E]">refresh_token</code>), they cannot be read or modified by JavaScript in accordance with the backend design. Inspect them directly in <strong>Browser DevTools &rarr; Application &rarr; Cookies</strong>.
          </p>
        </div>
      </Alert>

      {/* Test Data Context Bar */}
      <Card className="bg-[#FAF9F6]/80">
        <CardHeader className="py-3 px-5 border-b border-[#E7E5E0]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#71717A] flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              Shared Test Context (Reusable across requests)
            </CardTitle>
            <span className="text-xs text-[#71717A]">
              Variables: <code className="text-[#0F766E] font-mono">{"{{testEmail}}"}</code>, <code className="text-[#0F766E] font-mono">{"{{selectedGroupId}}"}</code>, etc.
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-[#71717A]">Test User Email</Label>
              <Input
                value={contextData.testEmail}
                onChange={(e) => setContextData((p) => ({ ...p, testEmail: e.target.value }))}
                className="h-8 text-xs font-mono"
                placeholder="test@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-[#71717A]">Test Password</Label>
              <Input
                value={contextData.testPassword}
                onChange={(e) => setContextData((p) => ({ ...p, testPassword: e.target.value }))}
                className="h-8 text-xs font-mono"
                type="password"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-[#71717A]">Active Group ID</Label>
              <Input
                value={contextData.selectedGroupId}
                onChange={(e) => setContextData((p) => ({ ...p, selectedGroupId: e.target.value }))}
                className="h-8 text-xs font-mono"
                placeholder="UUID from POST/GET /api/groups"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-[#71717A]">Target User ID</Label>
              <Input
                value={contextData.targetUserId}
                onChange={(e) => setContextData((p) => ({ ...p, targetUserId: e.target.value }))}
                className="h-8 text-xs font-mono"
                placeholder="UUID of target member"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-[#71717A]">Verification Token</Label>
              <Input
                value={contextData.verificationToken}
                onChange={(e) => setContextData((p) => ({ ...p, verificationToken: e.target.value }))}
                className="h-8 text-xs font-mono"
                placeholder="Paste token..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-[#E7E5E0] gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("scenarios")}
          className={cn(
            "pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
            activeTab === "scenarios"
              ? "border-[#0F766E] text-[#0F766E]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Test Scenarios
          {stats.total > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F3EF] text-[#18181B]">
              {stats.passed}/{stats.total} Passed
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={cn(
            "pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
            activeTab === "manual"
              ? "border-[#0F766E] text-[#0F766E]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]",
          )}
        >
          <Terminal className="h-4 w-4" />
          Manual Request Explorer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contracts")}
          className={cn(
            "pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2",
            activeTab === "contracts"
              ? "border-[#0F766E] text-[#0F766E]"
              : "border-transparent text-[#71717A] hover:text-[#18181B]",
          )}
        >
          <Layers className="h-4 w-4" />
          Backend Contract Matrix
        </button>
      </div>

      {/* TAB 1: PRECONFIGURED SCENARIOS */}
      {activeTab === "scenarios" && (
        <div className="space-y-4">
          {/* Category filter pills */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === "all" ? "primary" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory("all")}
            >
              All Scenarios ({TEST_SCENARIOS.length})
            </Button>
            {(Object.keys(CATEGORY_LABELS) as TestCategory[]).map((cat) => {
              const count = TEST_SCENARIOS.filter((s) => s.category === cat).length;
              return (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                  className="text-xs"
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </Button>
              );
            })}
          </div>

          {/* Scenario list */}
          <div className="space-y-3">
            {filteredScenarios.map((scenario) => {
              const result = results[scenario.id];
              const isRunning = runningScenarioId === scenario.id;
              const interpolatedPath = interpolateEndpoint(scenario.endpoint, contextData);

              return (
                <Card
                  key={scenario.id}
                  className={cn(
                    "transition-all duration-150 border",
                    result
                      ? result.passed
                        ? "border-teal-200 bg-teal-50/20"
                        : "border-red-200 bg-red-50/20"
                      : "border-[#E7E5E0]",
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0 uppercase",
                            scenario.method === "GET" && "bg-blue-100 text-blue-800",
                            scenario.method === "POST" && "bg-teal-100 text-teal-800",
                            scenario.method === "PATCH" && "bg-amber-100 text-amber-800",
                            scenario.method === "DELETE" && "bg-red-100 text-red-800",
                          )}
                        >
                          {scenario.method}
                        </span>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#18181B]">
                              {scenario.title}
                            </h3>
                            <code className="text-xs font-mono text-[#71717A] bg-white px-1.5 py-0.5 rounded border border-[#E7E5E0]">
                              {interpolatedPath}
                            </code>
                          </div>
                          <p className="text-xs text-[#52525B] leading-relaxed">
                            {scenario.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {result && (
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            {result.passed ? (
                              <Badge variant="accent" className="gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
                                PASS ({result.actualStatus})
                              </Badge>
                            ) : (
                              <Badge variant="danger" className="gap-1">
                                <XCircle className="h-3.5 w-3.5 text-red-700" />
                                FAIL ({result.actualStatus})
                              </Badge>
                            )}
                            <span className="text-[#71717A] text-[11px] tabular-nums">
                              {result.durationMs}ms
                            </span>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunSingle(scenario)}
                          isLoading={isRunning}
                          disabled={batchRunning}
                        >
                          <Play className="h-3 w-3" />
                          Run
                        </Button>
                      </div>
                    </div>

                    {/* Prereq & Expected info */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#71717A] bg-white/70 rounded-md p-2 border border-[#E7E5E0]">
                      <span>
                        <strong>Expected:</strong> HTTP{" "}
                        {Array.isArray(scenario.expectedStatus)
                          ? scenario.expectedStatus.join(" / ")
                          : scenario.expectedStatus}
                        {scenario.expectedMessageSubstring ? ` with "${scenario.expectedMessageSubstring}"` : ""}
                      </span>
                      {scenario.setupPrerequisites && (
                        <span>
                          <strong>Prereq:</strong> {scenario.setupPrerequisites}
                        </span>
                      )}
                      {result?.failureReason && (
                        <span className="text-red-700 font-medium w-full mt-1">
                          Reason: {result.failureReason}
                        </span>
                      )}
                    </div>

                    {/* Result payload collapse if exists */}
                    {result && (
                      <div className="space-y-2 pt-1 border-t border-[#E7E5E0]">
                        <div className="flex items-center justify-between text-xs text-[#71717A]">
                          <span className="font-mono">Actual Response Body:</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(JSON.stringify(result.response.body, null, 2), `res-${scenario.id}`)}
                            className="inline-flex items-center gap-1 hover:text-[#18181B] text-xs font-medium cursor-pointer"
                          >
                            {copiedKey === `res-${scenario.id}` ? (
                              <>
                                <Check className="h-3 w-3 text-teal-700" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Copy JSON
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="max-h-40 overflow-auto rounded bg-[#18181B] p-2.5 text-[11px] font-mono text-[#F4F3EF]">
                          {typeof result.response.body === "object"
                            ? JSON.stringify(result.response.body, null, 2)
                            : result.response.rawText || "(No Content / 204)"}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL REQUEST EXPLORER */}
      {activeTab === "manual" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Request builder */}
          <div className="lg:col-span-6 space-y-4">
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-sm">Request Builder</CardTitle>
                <CardDescription className="text-xs">
                  Pick a preset or enter any implemented Express route.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Quick Presets</Label>
                  <select
                    className="w-full text-xs font-mono rounded-lg border border-[#D6D3CD] bg-white p-2"
                    onChange={(e) => {
                      const found = PRESET_ENDPOINTS.find((p) => p.label === e.target.value);
                      if (found) handleSelectPreset(found);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select an existing backend endpoint...
                    </option>
                    {PRESET_ENDPOINTS.map((preset) => (
                      <option key={preset.label} value={preset.label}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="w-28 shrink-0">
                    <Label className="text-xs">Method</Label>
                    <select
                      value={manualMethod}
                      onChange={(e) => setManualMethod(e.target.value as HttpMethod)}
                      className="mt-1 w-full text-xs font-mono font-bold rounded-lg border border-[#D6D3CD] bg-white p-2"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <Label className="text-xs">Path</Label>
                    <Input
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      className="mt-1 text-xs font-mono"
                      placeholder="/api/auth/me"
                    />
                  </div>
                </div>

                {manualMethod !== "GET" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Request JSON Body</Label>
                      <button
                        type="button"
                        onClick={() => handleCopy(manualBody, "manual-body")}
                        className="text-xs text-[#71717A] hover:text-[#18181B] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === "manual-body" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy Body
                      </button>
                    </div>
                    <textarea
                      value={manualBody}
                      onChange={(e) => setManualBody(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-[#D6D3CD] bg-white p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      placeholder='{ "key": "value" }'
                    />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleManualSend}
                  isLoading={manualIsLoading}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Request
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Response inspector */}
          <div className="lg:col-span-6 space-y-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="py-4 border-b border-[#E7E5E0]">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Response Output</CardTitle>
                  {manualResponse && (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={manualResponse.ok ? "accent" : "danger"}
                        className="font-mono text-xs"
                      >
                        {manualResponse.status} {manualResponse.statusText}
                      </Badge>
                      <span className="text-xs font-mono text-[#71717A] tabular-nums">
                        {manualResponse.durationMs}ms
                      </span>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 flex-1 flex flex-col space-y-4">
                {manualResponse ? (
                  <>
                    {/* Headers Collapsible */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#71717A]">Response Headers</p>
                      <div className="max-h-24 overflow-auto rounded border border-[#E7E5E0] bg-[#FAF9F6] p-2 text-[11px] font-mono">
                        {Object.entries(manualResponse.headers).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-[#71717A]">{k}:</span>
                            <span className="text-[#18181B] truncate">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="space-y-1 flex-1 flex flex-col min-h-[220px]">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#71717A]">Response Body</p>
                        <button
                          type="button"
                          onClick={() => handleCopy(manualResponse.rawText, "manual-res")}
                          className="text-xs text-[#71717A] hover:text-[#18181B] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === "manual-res" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          Copy Response
                        </button>
                      </div>
                      <pre className="flex-1 overflow-auto rounded bg-[#18181B] p-3 text-xs font-mono text-[#F4F3EF]">
                        {typeof manualResponse.body === "object"
                          ? JSON.stringify(manualResponse.body, null, 2)
                          : manualResponse.rawText || "(No Content)"}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#71717A]">
                    <Code2 className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">No request sent yet</p>
                    <p className="text-xs mt-1">Select an endpoint or press "Send Request" to observe live output.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: CONTRACT MATRIX & LIMITATIONS */}
      {activeTab === "contracts" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Implemented Backend Endpoints</CardTitle>
              <CardDescription className="text-xs">
                Verified against Express route definitions and controllers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E7E5E0] text-[#71717A]">
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3">Route</th>
                      <th className="py-2 pr-3">Auth Required</th>
                      <th className="py-2">Expected Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F3EF] font-mono">
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/auth/register</td>
                      <td className="py-2">No</td>
                      <td className="py-2">201 Created / 503 if unconfigured</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/auth/login</td>
                      <td className="py-2">No</td>
                      <td className="py-2">200 OK (sets cookies)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/auth/refresh</td>
                      <td className="py-2">Cookie</td>
                      <td className="py-2">200 OK (rotates cookies)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/auth/logout</td>
                      <td className="py-2">Cookie</td>
                      <td className="py-2">204 No Content</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/auth/verify-email</td>
                      <td className="py-2">No</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-blue-800 font-bold">GET</td>
                      <td className="py-2">/api/auth/me</td>
                      <td className="py-2">Yes (access_token)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-800 font-bold">PATCH</td>
                      <td className="py-2">/api/auth/me</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-800 font-bold">PATCH</td>
                      <td className="py-2">/api/auth/me/password</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">204 No Content (revokes other sessions)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-800 font-bold">PATCH</td>
                      <td className="py-2">/api/auth/me/email</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-red-800 font-bold">DELETE</td>
                      <td className="py-2">/api/auth/me</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">204 No Content</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/groups</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">201 Created</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-blue-800 font-bold">GET</td>
                      <td className="py-2">/api/groups</td>
                      <td className="py-2">Yes</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-blue-800 font-bold">GET</td>
                      <td className="py-2">/api/groups/:groupId</td>
                      <td className="py-2">Yes (Active Member)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-800 font-bold">PATCH</td>
                      <td className="py-2">/api/groups/:groupId</td>
                      <td className="py-2">Yes (OWNER or ADMIN)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-red-800 font-bold">DELETE</td>
                      <td className="py-2">/api/groups/:groupId</td>
                      <td className="py-2">Yes (OWNER)</td>
                      <td className="py-2">200 OK (Archives group)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-blue-800 font-bold">GET</td>
                      <td className="py-2">/api/groups/:groupId/members</td>
                      <td className="py-2">Yes (Active Member)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-teal-800 font-bold">POST</td>
                      <td className="py-2">/api/groups/:groupId/members</td>
                      <td className="py-2">Yes (OWNER or ADMIN)</td>
                      <td className="py-2">201 Created</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-red-800 font-bold">DELETE</td>
                      <td className="py-2">/api/groups/:groupId/members/:targetUserId</td>
                      <td className="py-2">Yes (Self-leave, OWNER, or ADMIN)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-800 font-bold">PATCH</td>
                      <td className="py-2">/api/groups/:groupId/members/:targetUserId</td>
                      <td className="py-2">Yes (OWNER)</td>
                      <td className="py-2">200 OK</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-700" />
                Unsupported Endpoints (Why they are omitted from runnable tests)
              </CardTitle>
              <CardDescription className="text-xs text-amber-800">
                These capabilities are not yet implemented in the Express backend router.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {UNSUPPORTED_ENDPOINTS.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 rounded-lg bg-white border border-amber-200/60 text-xs gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#18181B]">{item.name}</span>
                      <p className="text-[#52525B] text-[11px] mt-0.5">{item.reason}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Not In Backend
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
