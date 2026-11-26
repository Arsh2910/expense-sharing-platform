import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "@/lib/api/client";
import { ForgotPasswordPage, ResetPasswordPage } from "./password-reset-pages";

afterEach(() => vi.restoreAllMocks());

function LoginDestination() {
  return <p>{useLocation().state?.passwordResetMessage}</p>;
}

function renderFlow(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("shows the generic response from forgot password", async () => {
  const api = vi.spyOn(client, "apiRequest").mockResolvedValue({
    message: "If an eligible account exists, a password reset link will be sent.",
  });
  renderFlow("/forgot-password");
  fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "user@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByText(/If an eligible account exists/)).toBeDefined();
  expect(screen.getByText(/check your spam or junk folder/i)).toBeDefined();
  expect(api).toHaveBeenCalledWith("/api/auth/forgot-password", expect.objectContaining({
    body: { email: "user@example.test" },
  }));
});

it("submits the fragment token in the reset POST and returns to sign in", async () => {
  const token = "x".repeat(43);
  const api = vi.spyOn(client, "apiRequest").mockResolvedValue({
    message: "Password updated. Sign in with your new password.",
  });
  renderFlow(`/reset-password#token=${token}`);
  fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "NewPassword123" } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByText(/Password updated/)).toBeDefined();
  expect(api).toHaveBeenCalledWith("/api/auth/reset-password", expect.objectContaining({
    body: { token, newPassword: "NewPassword123" },
  }));
});
