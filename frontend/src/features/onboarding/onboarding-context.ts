import { createContext, useContext } from "react";

export type Progress = { step: "expense" | "balances"; groupId: string } | { step: "done" };
type Onboarding = {
  progress: Progress | null;
  canStart: boolean;
  enterGroup: (groupId: string) => void;
  expenseCreated: (groupId: string) => void;
  finish: () => void;
};

export const OnboardingContext = createContext<Onboarding | null>(null);

export function useOnboarding() {
  return useContext(OnboardingContext);
}
