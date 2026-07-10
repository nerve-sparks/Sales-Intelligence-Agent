import { LoginPage } from "./features/auth/LoginPage";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";

export default function App() {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;

  if (pathname.includes("onboarding")) {
    return <OnboardingPage />;
  }

  return <LoginPage />;
}
