import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PublicUser } from "@/types/api";
import { OnboardingProvider } from "./onboarding";
import { useOnboarding } from "./onboarding-context";

const now = new Date().toISOString();
const user: PublicUser = {
  id: "first-user",
  username: null,
  email: "casey@example.test",
  displayName: "Casey",
  status: "ACTIVE",
  emailVerifiedAt: now,
  createdAt: now,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function TourActions() {
  const tour = useOnboarding()!;
  return (
    <>
      <output>{tour.progress?.step ?? (tour.canStart ? "ready" : "inactive")}</output>
      <button onClick={() => tour.enterGroup("first-group")}>Enter first group</button>
      <button onClick={() => tour.expenseCreated("other-group")}>Save elsewhere</button>
      <button onClick={() => tour.expenseCreated("first-group")}>Save first expense</button>
      <button onClick={tour.finish}>Skip</button>
    </>
  );
}

function renderTour(account = user) {
  return render(<OnboardingProvider user={account}><TourActions /></OnboardingProvider>);
}

function runAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function expectStep(step: string) {
  expect(screen.getByRole("status").textContent).toBe(step);
}

it("resumes the guide for the same group and advances only after an expense in that group", () => {
  const firstRender = renderTour();
  expectStep("ready");
  runAction("Enter first group");
  expectStep("expense");
  firstRender.unmount();

  renderTour();
  expectStep("expense");
  runAction("Save elsewhere");
  expectStep("expense");
  runAction("Save first expense");
  expectStep("balances");
});

it("keeps dismissal separate for each signed-in account", () => {
  const firstRender = renderTour();
  runAction("Skip");
  firstRender.unmount();

  const secondRender = renderTour();
  expectStep("done");
  runAction("Enter first group");
  expectStep("done");
  secondRender.unmount();

  renderTour({ ...user, id: "other-user" });
  expectStep("ready");
});

it("does not start automatically for established accounts", () => {
  renderTour({ ...user, createdAt: "2024-01-01T00:00:00.000Z" });
  runAction("Enter first group");
  expectStep("inactive");
});
