import { useState, type ReactNode } from "react";
import type { PublicUser } from "@/types/api";

import { OnboardingContext, type Progress } from "./onboarding-context";

const NEW_ACCOUNT_WINDOW = 7 * 24 * 60 * 60 * 1000;

function readProgress(key: string): Progress | null {
  try {
    const progress = JSON.parse(localStorage.getItem(key) ?? "null") as Progress | null;
    if (progress?.step === "done") return progress;
    if ((progress?.step === "expense" || progress?.step === "balances") &&
        typeof progress.groupId === "string") return progress;
  } catch {
    // Users can still take the tour when browser storage is unavailable.
  }
  return null;
}

export function OnboardingProvider({ user, children }: {
  user: PublicUser;
  children: ReactNode;
}) {
  const key = `splitcircle:onboarding:v1:${user.id}`;
  const [progress, setProgress] = useState(() => readProgress(key));
  const [isNewAccount] = useState(() => {
    const accountAge = Date.now() - Date.parse(user.createdAt);
    return accountAge >= 0 && accountAge < NEW_ACCOUNT_WINDOW;
  });
  const canStart = progress === null && isNewAccount;

  function save(next: Progress) {
    setProgress(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep progress for this session.
    }
  }

  return (
    <OnboardingContext.Provider value={{
      progress,
      canStart,
      enterGroup(groupId) {
        if (canStart) save({ step: "expense", groupId });
      },
      expenseCreated(groupId) {
        if (progress?.step === "expense" && progress.groupId === groupId) {
          save({ step: "balances", groupId });
        }
      },
      finish() {
        if (progress?.step !== "done") save({ step: "done" });
      },
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}
