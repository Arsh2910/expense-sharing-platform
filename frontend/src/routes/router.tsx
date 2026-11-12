import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { NotFoundPage } from "@/components/layout/not-found-page";
import { RouteErrorPage } from "@/components/layout/route-error-page";
import { ActivityPage } from "@/features/activity/activity-page";
import { LoginPage } from "@/features/auth/login-page";
import { RegisterPage } from "@/features/auth/register-page";
import { VerifyEmailPage } from "@/features/auth/verify-email-page";
import { VerifyPendingPage } from "@/features/auth/verify-pending-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { DevApiTestingPage } from "@/features/dev/dev-api-page";
import { GroupDetailsPage } from "@/features/groups/group-details-page";
import { GroupsListPage } from "@/features/groups/groups-list-page";
import { AccountSettingsPage } from "@/features/settings/settings-page";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/route-guards";

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: "/dev/api-tests",
        element: <DevApiTestingPage />,
      },
    ]
  : [];

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
          { path: "/verify-pending", element: <VerifyPendingPage /> },
        ],
      },
      // Accessible both before login (registration verification) and while signed in (email change verification)
      {
        path: "/verify-email",
        element: <VerifyEmailPage />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: "/", element: <DashboardPage /> },
              { path: "/groups", element: <GroupsListPage /> },
              { path: "/groups/:groupId", element: <GroupDetailsPage /> },
              { path: "/activity", element: <ActivityPage /> },
              { path: "/settings", element: <AccountSettingsPage /> },
              ...devRoutes,
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);

