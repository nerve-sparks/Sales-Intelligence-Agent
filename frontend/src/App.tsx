import type { ReactElement } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CurrentUserProvider } from "./lib/CurrentUserContext";
import { PageTransition } from "./components/layout/PageTransition";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequireOnboarding } from "./components/auth/RequireOnboarding";
import { LoginPage } from "./features/auth/LoginPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { SignalIntelligencePage } from "./features/signal-intelligence/SignalIntelligencePage";
import { SignalFeedPage } from "./features/signal-intelligence/SignalFeedPage";
import { SignalDetailPage } from "./features/signal-intelligence/SignalDetailPage";
import { SignalAnalyticsPage } from "./features/signal-intelligence/SignalAnalyticsPage";
import { TriggerLibraryPage } from "./features/trigger-intelligence/TriggerLibraryPage";
import { TriggerDetailPage } from "./features/trigger-intelligence/TriggerDetailPage";
import { TriggerEditorPage } from "./features/trigger-intelligence/TriggerEditorPage";
import { EnterpriseListPage } from "./features/crm-intelligence/EnterpriseListPage";
import { EnterpriseDetailPage } from "./features/crm-intelligence/EnterpriseDetailPage";
import { BuyingCommitteePage } from "./features/crm-intelligence/BuyingCommitteePage";
import { MemberDetailPage } from "./features/crm-intelligence/MemberDetailPage";
import { ScoreBreakdownPage } from "./features/crm-intelligence/ScoreBreakdownPage";
import { ScoreHistoryPage } from "./features/crm-intelligence/ScoreHistoryPage";
import { SettingsIcpDataPage } from "./features/settings/SettingsIcpDataPage";

// Order mirrors the old pathname.includes() checks (most specific first),
// though react-router's exact path matching makes that ordering no longer
// load-bearing the way it was before.
const routes: { path: string; element: ReactElement }[] = [
  { path: "/score-history", element: <ScoreHistoryPage /> },
  { path: "/score-breakdown", element: <ScoreBreakdownPage /> },
  { path: "/member-detail", element: <MemberDetailPage /> },
  { path: "/buying-committee", element: <BuyingCommitteePage /> },
  { path: "/enterprise-detail", element: <EnterpriseDetailPage /> },
  { path: "/enterprise-list", element: <EnterpriseListPage /> },
  { path: "/trigger-editor", element: <TriggerEditorPage /> },
  { path: "/trigger-details", element: <TriggerDetailPage /> },
  { path: "/trigger-library", element: <TriggerLibraryPage /> },
  { path: "/signal-analytics", element: <SignalAnalyticsPage /> },
  { path: "/signal-detail", element: <SignalDetailPage /> },
  { path: "/signal-feed", element: <SignalFeedPage /> },
  { path: "/signal-intelligence", element: <SignalIntelligencePage /> },
  { path: "/dashboard", element: <DashboardPage /> },
  { path: "/onboarding", element: <OnboardingPage /> },
  { path: "/settings", element: <SettingsIcpDataPage /> },
];

export default function App() {
  return (
    <BrowserRouter>
      {/* Mounted once, above every route, so client-side navigation between
          pages never resets "who is logged in" back to unknown - see
          lib/CurrentUserContext.tsx for why that used to flicker. */}
      <CurrentUserProvider>
        <Routes>
          {routes.map(({ path, element }) => (
            <Route
              element={
                <PageTransition>
                  <RequireAuth>
                    {path === "/onboarding" ? element : <RequireOnboarding>{element}</RequireOnboarding>}
                  </RequireAuth>
                </PageTransition>
              }
              key={path}
              path={path}
            />
          ))}
          {/* LoginPage covers "/", "/forgot-password" and "/mfa-verification"
              itself (reads window.location.pathname to pick a mode) - the
              wildcard catches all three plus anything unrecognized, same as
              the old fallback. */}
          <Route element={<PageTransition><LoginPage /></PageTransition>} path="*" />
        </Routes>
      </CurrentUserProvider>
    </BrowserRouter>
  );
}
