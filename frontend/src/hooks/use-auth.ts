import * as React from "react";
import { AuthContext, type AuthContextValue } from "@/features/auth/auth-context-value";

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

