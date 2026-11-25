import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { OAuthCompletePage, OAuthNotice, OAuthOptions } from "./oauth-options";

vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn(),
  apiUrl: (path: string) => path,
}));

afterEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
});

it("shows a sign-in link only for an enabled provider", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ data: ["google"] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OAuthOptions />
    </QueryClientProvider>,
  );
  const google = await screen.findByRole("link", { name: "Sign in with Google" });
  expect(google.getAttribute("href")).toBe("/api/auth/oauth/google/start");
  expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
});

it("shows the GitHub mark alongside the accessible sign-in label", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ data: ["github"] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OAuthOptions />
    </QueryClientProvider>,
  );
  const github = await screen.findByRole("link", { name: "Continue with GitHub" });
  expect(github.getAttribute("href")).toBe("/api/auth/oauth/github/start");
  expect(github.querySelector("svg[aria-hidden='true'] use")?.getAttribute("href")).toBe("/icons.svg#github-icon");
});

it("links to email registration when Google cannot establish ownership of the address", () => {
  render(
    <MemoryRouter initialEntries={["/login?oauth=verify_locally"]}>
      <OAuthNotice />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Create an account with email" }).getAttribute("href")).toBe("/register");
});

function Destination() {
  const location = useLocation();
  return <div>{location.pathname}{location.search}</div>;
}

it.each([
  ["/invitations/accept?invitationId=example", "/invitations/accept?invitationId=example"],
  ["//external.example/path", "/"],
])("finishes an OAuth redirect with a local destination", async (returnTo, expected) => {
  sessionStorage.setItem("splitcircle:oauth-return", returnTo);
  render(
    <MemoryRouter initialEntries={["/oauth/complete"]}>
      <Routes>
        <Route path="/oauth/complete" element={<OAuthCompletePage />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(expected)).toBeDefined();
  expect(sessionStorage.getItem("splitcircle:oauth-return")).toBeNull();
});
