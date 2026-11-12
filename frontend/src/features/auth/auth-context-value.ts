import * as React from "react";
import type { PublicUser } from "@/types/api";

export interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  refetchSession: () => Promise<unknown>;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

