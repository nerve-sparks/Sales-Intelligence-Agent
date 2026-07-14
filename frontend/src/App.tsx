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

export default function App() {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;

  if (pathname.includes("member-detail")) {
    return <MemberDetailPage />;
  }

  if (pathname.includes("buying-committee")) {
    return <BuyingCommitteePage />;
  }

  if (pathname.includes("enterprise-detail")) {
    return <EnterpriseDetailPage />;
  }

  if (pathname.includes("enterprise-list")) {
    return <EnterpriseListPage />;
  }

  if (pathname.includes("trigger-editor")) {
    return <TriggerEditorPage />;
  }

  if (pathname.includes("trigger-details")) {
    return <TriggerDetailPage />;
  }

  if (pathname.includes("trigger-library")) {
    return <TriggerLibraryPage />;
  }

  if (pathname.includes("signal-analytics")) {
    return <SignalAnalyticsPage />;
  }

  if (pathname.includes("signal-detail")) {
    return <SignalDetailPage />;
  }

  if (pathname.includes("signal-feed")) {
    return <SignalFeedPage />;
  }

  if (pathname.includes("signal-intelligence")) {
    return <SignalIntelligencePage />;
  }

  if (pathname.includes("dashboard")) {
    return <DashboardPage />;
  }

  if (pathname.includes("onboarding")) {
    return <OnboardingPage />;
  }

  return <LoginPage />;
}
