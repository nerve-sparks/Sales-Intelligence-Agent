import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";

type AuthMode = "login" | "forgot" | "mfa";

const asset = (name: string) =>
  new URL(`../../assets/figma/login/${name}`, import.meta.url).href;

const image3 = asset("image-3.png");
const container = asset("container.svg");

const pageBackground =
  "linear-gradient(259.178deg, rgb(240, 242, 253) 8.1395%, rgb(240, 242, 252) 63.479%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)";

const vectors = [
  asset("vector-00.svg"),
  asset("vector-01.svg"),
  asset("vector-02.svg"),
  asset("vector-03.svg"),
  asset("vector-04.svg"),
  asset("vector-05.svg"),
  asset("vector-06.svg"),
  asset("vector-07.svg"),
  asset("vector-08.svg"),
  asset("vector-09.svg"),
  asset("vector-10.svg"),
  asset("vector-11.svg"),
  asset("vector-12.svg"),
  asset("vector-13.svg"),
  asset("vector-14.svg"),
  asset("vector-15.svg"),
  asset("vector-16.svg"),
  asset("vector-17.svg"),
  asset("vector-18.svg"),
  asset("vector-19.svg"),
  asset("vector-20.svg"),
  asset("vector-21.svg"),
  asset("vector-22.svg"),
  asset("vector-23.svg"),
  asset("vector-24.svg"),
  asset("vector-25.svg"),
  asset("vector-26.svg"),
  asset("vector-27.svg"),
  asset("vector-28.svg"),
  asset("vector-29.svg"),
  asset("vector-30.svg"),
  asset("vector-31.svg"),
  asset("vector-32.svg"),
  asset("vector-33.svg"),
  asset("vector-34.svg"),
  asset("vector-35.svg"),
  asset("vector-36.svg"),
];

const icons = [
  asset("svg-00.svg"),
  asset("svg-01.svg"),
  asset("svg-02.svg"),
  asset("svg-03.svg"),
  asset("svg-04.svg"),
  asset("svg-05.svg"),
  asset("svg-06.svg"),
  asset("svg-07.svg"),
  asset("svg-08.svg"),
  asset("svg-09.svg"),
  asset("svg-10.svg"),
];

const logoLargePieces = [
  "14.88% 85.19% 0 0",
  "14.96% 71.93% 39.1% 19.27%",
  "15.01% 62.33% 39.16% 29.42%",
  "15.02% 52.8% 25.5% 38.95%",
  "15.01% 43.26% 39.16% 48.5%",
  "15.02% 35.6% 39.16% 58.04%",
  "0 26.14% 39.17% 65.7%",
  "15.01% 16.6% 39.16% 75.15%",
  "15.01% 2.97% 39.16% 88.79%",
  "0.11% 0.16% 39.16% 98.31%",
  "45.04% 12.54% 39.15% 84.7%",
];

const logoSmallPieces = [
  { source: 11, inset: "86.76% 78.83% 1.07% 19.3%" },
  { source: 12, inset: "86.49% 76.23% 0.82% 21.87%" },
  { source: 13, inset: "86.49% 73.46% 0.82% 24.64%" },
  { source: 14, inset: "86.49% 70.5% 0.81% 27.41%" },
  { source: 15, inset: "86.76% 67.93% 0.87% 30.44%" },
  { source: 16, inset: "86.76% 65.24% 1.07% 33.09%" },
  { source: 17, inset: "86.76% 62.64% 1.07% 35.68%" },
  { source: 18, inset: "86.76% 60.28% 1.07% 37.84%" },
  { source: 19, inset: "86.76% 57.76% 1.07% 40.6%" },
  { source: 20, inset: "86.76% 55.44% 1.07% 43.18%" },
  { source: 21, inset: "86.76% 52.98% 1.07% 45.48%" },
  { source: 22, inset: "86.76% 48.54% 1.07% 50.02%" },
  { source: 23, inset: "86.76% 45.95% 1.05% 52.39%" },
  { source: 24, inset: "86.49% 43% 0.81% 54.92%" },
  { source: 25, inset: "86.76% 39.95% 1.07% 57.98%" },
  { source: 26, inset: "86.76% 36.6% 1.07% 63.13%" },
  { source: 27, inset: "86.76% 33.82% 1.07% 64.46%" },
  { source: 28, inset: "86.76% 31.3% 1.07% 67.16%" },
  { source: 29, inset: "86.76% 28.6% 1.07% 69.53%" },
  { source: 30, inset: "86.76% 24.14% 1.07% 74.17%" },
  { source: 31, inset: "86.49% 21.35% 0.81% 76.56%" },
  { source: 24, inset: "86.49% 16.35% 0.81% 81.57%" },
  { source: 32, inset: "86.76% 13.78% 0.87% 84.59%" },
  { source: 30, inset: "86.76% 11.21% 1.07% 87.11%" },
  { source: 33, inset: "86.49% 8.61% 0.82% 89.5%" },
  { source: 34, inset: "86.49% 5.64% 0.81% 92.27%" },
  { source: 35, inset: "86.76% 2.59% 1.07% 95.33%" },
  { source: 36, inset: "86.76% 0 1.07% 98.46%" },
];

const screenCopy = {
  login: {
    headline: ["Intelligence that finds", "opportunities."],
    accent: "You close them.",
    description:
      "AI-powered trigger detection, prospect scoring and outreach automation to help sales teams focus on what matters most.",
  },
  forgot: {
    headline: ["Reset your password,"],
    accent: "regain access",
    description:
      "Enter your registered email address and we'll send you a secure link to reset your password.",
  },
  mfa: {
    headline: ["One more step", "to secure your account"],
    accent: "Security. Built in.",
    description:
      "We've sent a verification code to your device. Enter the code below to continue.",
  },
};

const featureSets = {
  login: [
    {
      icon: icons[0],
      bg: "#fff7ed",
      title: "Detect High-Intent Signals",
      text: "Monitor 120+ real-time data sources",
    },
    {
      icon: icons[1],
      bg: "#eff6ff",
      title: "Score with Confidence",
      text: "AI-powered Conversion Readiness Score (CRS)",
    },
    {
      icon: icons[2],
      bg: "#faf5ff",
      title: "Outreach That Converts",
      text: "Personalized, trigger-based outreach at scale",
    },
    {
      icon: icons[3],
      bg: "#fef2f2",
      title: "Win More Deals",
      text: "Actionable insights that accelerate your pipeline",
    },
  ],
  forgot: [
    {
      icon: icons[8],
      bg: "#fff7ed",
      title: "Secure & Protected",
      text: "Your account is protected with enterprise grade security.",
    },
    {
      icon: icons[2],
      bg: "#faf5ff",
      title: "Quick Recovery",
      text: "Reset your password in less than 2 minutes.",
    },
    {
      icon: icons[9],
      bg: "#eff6ff",
      title: "Safe & Private",
      text: "We never share your information with anyone.",
    },
  ],
  mfa: [
    {
      icon: icons[8],
      bg: "#ffffff",
      title: "Enterprise-grade security",
      text: "Your data is protected with advanced encryption and access controls.",
    },
    {
      icon: icons[9],
      bg: "#ffffff",
      title: "Only authorized access",
      text: "Multi-factor authentication ensures that only you can access your account.",
    },
    {
      icon: icons[5],
      bg: "#ffffff",
      title: "Secure. Private. Trusted.",
      text: "We follow industry best practices to keep your information safe.",
    },
    {
      icon: icons[3],
      bg: "#ffffff",
      title: "You're in control",
      text: "Manage your security preferences anytime from account settings.",
    },
  ],
};

const formCopy = {
  login: {
    title: "Welcome back",
    subtitle: "Sign in to continue to your dashboard",
    submit: "Sign in",
  },
  forgot: {
    title: "Forgot Password?",
    subtitle: "No worries! Enter your email and we'll send you a link to reset it.",
    submit: "Send Reset Link",
  },
  mfa: {
    title: "Verify Your Identity",
    subtitle: "Enter the 6-digit code sent to",
    submit: "Verify Code",
  },
};

function getInitialMode(): AuthMode {
  if (typeof window === "undefined") {
    return "login";
  }

  if (window.location.pathname.includes("mfa-verification")) {
    return "mfa";
  }

  if (window.location.pathname.includes("forgot-password")) {
    return "forgot";
  }

  return "login";
}

const badges = [
  { icon: icons[8], bg: "#fff7ed", title: "SOC 2", text: "Compliant" },
  { icon: icons[9], bg: "#e3efff", title: "Enterprise", text: "Grade Security" },
  { icon: icons[10], bg: "#ffffff", title: "99.9%", text: "Uptime SLA" },
  {
    icon: icons[8],
    bg: "#fff7ed",
    title: "Your data is safe",
    text: "and encrypted",
  },
];

export function FigmaLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-[34px] w-[193px] shrink-0 overflow-hidden ${className}`}
    >
      {logoLargePieces.map((inset, index) => (
        <div
          className="absolute"
          key={`logo-large-${index}`}
          style={{ inset }}
        >
          <img
            alt=""
            className="absolute inset-0 block max-w-none size-full"
            src={vectors[index]}
          />
        </div>
      ))}
      {logoSmallPieces.map((piece, index) => (
        <div
          className="absolute"
          key={`logo-small-${index}`}
          style={{ inset: piece.inset }}
        >
          <img
            alt=""
            className="absolute inset-0 block max-w-none size-full"
            src={vectors[piece.source]}
          />
        </div>
      ))}
    </div>
  );
}

function FeatureList({ mode }: { mode: AuthMode }) {
  return (
    <div className="relative z-10 flex w-full max-w-[520px] flex-col gap-[10px]">
      {featureSets[mode].map((feature) => (
        <div className="flex items-start gap-[16px]" key={feature.title}>
          <div
            className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] p-[8px]"
            style={{ backgroundColor: feature.bg }}
          >
            <img alt="" className="size-[24px]" src={feature.icon} />
          </div>
          <div className="min-w-0 pt-[1px]">
            <p className="m-0 font-['IBM_Plex_Sans'] text-[15px] font-bold leading-[24px] text-[#1e293b]">
              {feature.title}
            </p>
            <p className="m-0 font-['IBM_Plex_Sans'] text-[12px] font-normal leading-[20px] text-[#64748b]">
              {feature.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MfaVerificationBody() {
  const [code, setCode] = useState(Array(6).fill(""));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleCodeChange = (
    index: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value.replace(/\D/g, "").slice(-1);
    const nextCode = [...code];
    nextCode[index] = value;
    setCode(nextCode);

    if (value && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <>
      <div className="flex w-full flex-col items-center gap-[8px]">
        <div className="relative h-[51px] w-[52px]">
          <img
            alt=""
            className="absolute left-[-34.62%] top-[-35.29%] h-[170.58%] w-[169.23%] max-w-none"
            src={container}
          />
        </div>
        <h2 className="m-0 pt-[clamp(0.75rem,2vh,22px)] text-center font-['IBM_Plex_Sans'] text-[clamp(1.875rem,2.5vw,34px)] font-bold leading-[1.2] text-[#0f172a]">
          Verify Your Identity
        </h2>
        <div className="text-center font-['IBM_Plex_Sans'] text-[clamp(0.95rem,1.25vw,17px)] leading-[25px] text-[#64748b]">
          <p className="m-0">Enter the 6-digit code sent to</p>
          <p className="m-0">
            <span className="font-medium text-[#005bff]">
              arjun.kumar@xsparks.ai
            </span>
            <span className="mx-[14px] text-[#cbd5e1]">|</span>
            <button
              className="bg-transparent p-0 font-medium text-[#005bff]"
              type="button"
            >
              Change
            </button>
          </p>
        </div>
      </div>

      <form
        className="flex w-full flex-col items-center gap-[clamp(1rem,2vh,24px)]"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="grid w-full max-w-[448px] grid-cols-6 gap-[clamp(0.4rem,0.8vw,0.75rem)]">
          {code.map((digit, index) => (
            <input
              aria-label={`Verification code digit ${index + 1}`}
              autoComplete={index === 0 ? "one-time-code" : "off"}
              className="aspect-square min-w-0 rounded-[10px] border border-[#dbe4f0] bg-white text-center font-['IBM_Plex_Sans'] text-[clamp(1.35rem,2vw,30px)] font-medium leading-none text-[#005bff] outline-none shadow-[0px_1px_2px_rgba(15,23,42,0.03)] focus:border-[#005bff] focus:ring-2 focus:ring-[#005bff]/15"
              inputMode="numeric"
              key={`mfa-code-${index}`}
              maxLength={1}
              onChange={(event) => handleCodeChange(index, event)}
              onKeyDown={(event) => handleCodeKeyDown(index, event)}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              type="text"
              value={digit}
            />
          ))}
        </div>

        <p className="m-0 font-['IBM_Plex_Sans'] text-[clamp(1rem,1.3vw,19px)] font-medium leading-[28px] text-[#64748b]">
          Code expires in{" "}
          <span className="font-normal text-[#f75317]">02:48</span>
        </p>

        <button
          className="flex h-[54px] w-full max-w-[448px] items-center justify-center gap-[8px] rounded-[10px] bg-gradient-to-r from-[#ff5a18] via-[#c331d1] to-[#005bff] px-[16px] py-[12px] shadow-[0px_10px_15px_-3px_rgba(249,115,22,0.2),0px_4px_6px_-4px_rgba(249,115,22,0.2)]"
          type="submit"
        >
          <span className="font-['IBM_Plex_Sans'] text-[17px] font-bold leading-[24px] text-white">
            Verify Code
          </span>
          <img alt="" className="size-[22px]" src={icons[7]} />
        </button>
      </form>

      <div className="flex w-full max-w-[448px] items-center gap-[16px] self-center">
        <div className="h-px flex-1 bg-[#e2e8f0]" />
        <span className="whitespace-nowrap font-['IBM_Plex_Sans'] text-[15px] font-bold leading-[22px] text-[#64748b]">
          Didn't receive the code?
        </span>
        <div className="h-px flex-1 bg-[#e2e8f0]" />
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-x-[clamp(1.5rem,3.2vw,3rem)] gap-y-3 font-['IBM_Plex_Sans'] text-[16px] font-bold leading-[24px]">
        <button
          className="flex items-center gap-[12px] bg-transparent p-0 text-[#005bff]"
          type="button"
        >
          <img alt="" className="size-[22px]" src={icons[10]} />
          Resend Code
        </button>
        <button
          className="flex items-center gap-[12px] bg-transparent p-0 text-[#0f172a]"
          type="button"
        >
          <img alt="" className="size-[22px]" src={icons[5]} />
          Use Backup Code
        </button>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-[clamp(0.75rem,2.5vh,2rem)] font-['IBM_Plex_Sans'] text-[clamp(0.95rem,1.2vw,17px)] leading-[24px]">
        <img alt="" className="size-[18px]" src={icons[5]} />
        <span className="text-[#475569]">Having trouble?</span>
        <a className="font-bold text-[#005bff] no-underline" href="/support">
          Contact support
        </a>
      </div>
    </>
  );
}

function LoginForm({
  mode,
  onBack,
  onForgot,
}: {
  mode: AuthMode;
  onBack: () => void;
  onForgot: () => void;
}) {
  const isForgot = mode === "forgot";
  const isMfa = mode === "mfa";
  const copy = formCopy[mode];
  const cardClassName = isMfa
    ? "flex min-h-[clamp(610px,63vh,660px)] w-full max-w-[560px] flex-col gap-[23px] rounded-[24px] border border-[#f1f5f9] bg-white p-[clamp(1.875rem,3.25vw,56px)] shadow-[0px_20px_25px_rgba(0,0,0,0.05)]"
    : "flex min-h-[clamp(610px,63vh,660px)] w-full max-w-[560px] flex-col gap-[23px] rounded-[24px] border border-[#f1f5f9] bg-white p-[clamp(1.875rem,3.25vw,56px)] shadow-[0px_20px_25px_rgba(0,0,0,0.05)]";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isForgot && !isMfa) {
      onForgot();
    }
  };

  if (isMfa) {
    return (
      <div className={cardClassName}>
        <MfaVerificationBody />
      </div>
    );
  }

  return (
    <div className={cardClassName}>
      <div className="flex w-full flex-col items-center gap-[8px]">
        <div className="relative h-[51px] w-[52px]">
          <img
            alt=""
            className="absolute left-[-34.62%] top-[-35.29%] h-[170.58%] w-[169.23%] max-w-none"
            src={container}
          />
        </div>
        <h2 className="m-0 pt-[clamp(0.75rem,2vh,22px)] text-center font-['IBM_Plex_Sans'] text-[clamp(1.875rem,2.5vw,34px)] font-bold leading-[1.2] text-[#0f172a]">
          {copy.title}
        </h2>
        <p className="m-0 text-center font-['IBM_Plex_Sans'] text-[clamp(0.95rem,1.25vw,17px)] font-normal leading-[25px] text-[#64748b]">
          {copy.subtitle}
        </p>
      </div>

      <form
        className="flex w-full flex-col gap-[clamp(1rem,2vh,24px)] pt-[8px]"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-[8px]">
          <label className="font-['IBM_Plex_Sans'] text-[14px] font-medium leading-[20px] text-[#334155]">
            Email address
          </label>
          <div className="relative">
            <input
              autoComplete="email"
              className="h-[56px] w-full rounded-[12px] border border-[#e2e8f0] bg-[#f8fafc] py-[15px] pl-[48px] pr-[17px] font-['IBM_Plex_Sans'] text-[17px] font-normal text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#cbd5e1]"
              name="email"
              placeholder="Enter your work email"
              type="email"
            />
            <img
              alt=""
              className="pointer-events-none absolute left-[16px] top-1/2 size-[20px] -translate-y-1/2"
              src={icons[4]}
            />
          </div>
        </div>

        {!isForgot && (
          <>
            <div className="flex flex-col gap-[8px]">
              <label className="font-['IBM_Plex_Sans'] text-[14px] font-medium leading-[20px] text-[#334155]">
                Password
              </label>
              <div className="relative">
                <input
                  autoComplete="current-password"
                  className="h-[56px] w-full rounded-[12px] border border-[#e2e8f0] bg-[#f8fafc] py-[15px] pl-[48px] pr-[52px] font-['IBM_Plex_Sans'] text-[17px] font-normal text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#cbd5e1]"
                  name="password"
                  placeholder="Enter your password"
                  type="password"
                />
                <img
                  alt=""
                  className="pointer-events-none absolute left-[16px] top-1/2 size-[20px] -translate-y-1/2"
                  src={icons[5]}
                />
                <button
                  aria-label="Show password"
                  className="absolute right-0 top-0 flex h-[56px] w-[56px] items-center justify-center"
                  type="button"
                >
                  <img alt="" className="size-[20px]" src={icons[6]} />
                </button>
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-4">
              <label className="flex items-center font-['IBM_Plex_Sans'] text-[14px] font-normal leading-[20px] text-[#475569]">
                <input
                  className="mr-[8px] size-[16px] shrink-0 rounded-[4px] border border-[#cbd5e1] bg-white accent-[#4f46e5]"
                  name="remember"
                  type="checkbox"
                />
                Remember me
              </label>
              <button
                className="whitespace-nowrap bg-transparent p-0 font-['IBM_Plex_Sans'] text-[14px] font-medium leading-[20px] text-[#4f46e5]"
                onClick={onForgot}
                type="button"
              >
                Forgot password?
              </button>
            </div>
          </>
        )}

        <button
          className="flex h-[54px] w-full items-center justify-center gap-[7.99px] rounded-[12px] bg-gradient-to-r from-[#f75317] via-[#7c3aed] via-[58.173%] to-[#0c20ff] to-[97.115%] px-[16px] py-[12px] shadow-[0px_10px_15px_-3px_rgba(249,115,22,0.2),0px_4px_6px_-4px_rgba(249,115,22,0.2)]"
          type="submit"
        >
          <span className="font-['IBM_Plex_Sans'] text-[17px] font-bold leading-[24px] text-white">
            {copy.submit}
          </span>
          <img alt="" className="size-[20px]" src={icons[7]} />
        </button>
      </form>

      {isForgot ? (
        <>
          <button
            className="flex h-[56px] w-full items-center justify-center rounded-[12px] border border-[#e2e8f0] bg-white px-[16px] font-['IBM_Plex_Sans'] text-[16px] font-bold leading-[24px] text-[#334155] shadow-[0px_1px_2px_rgba(15,23,42,0.03)]"
            onClick={onBack}
            type="button"
          >
            Back to sign in
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-[8px] font-['IBM_Plex_Sans'] text-[16px] leading-[24px]">
            <span className="text-[#64748b]">Need help?</span>
            <a className="font-bold text-[#4f46e5] no-underline" href="/support">
              Contact support
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="relative h-[16px] w-full">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-px w-full border-t border-[#e2e8f0]" />
            </div>
            <div className="relative flex h-full justify-center">
              <span className="bg-white px-[16px] font-['IBM_Plex_Sans'] text-[12px] font-normal uppercase leading-[16px] tracking-[0.6px] text-[#94a3b8]">
                OR CONTINUE WITH
              </span>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-center gap-x-[8px] gap-y-1 pt-[8px]">
            <p className="m-0 text-center font-['IBM_Plex_Sans'] text-[16px] font-normal leading-[24px] text-[#64748b]">
              New to xsparks.ai?
            </p>
            <a
              className="whitespace-nowrap text-center font-['IBM_Plex_Sans'] text-[16px] font-bold leading-[24px] text-[#4f46e5] no-underline"
              href="/request-access"
            >
              Create an Account
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function TrustBadges() {
  return (
    <div className="grid w-full max-w-[720px] grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4 lg:max-w-[700px]">
      {badges.map((badge) => (
        <div className="flex min-w-0 items-center gap-[12px]" key={badge.title}>
          <div
            className="flex size-[36px] shrink-0 items-center justify-center rounded-[8px] p-[8px]"
            style={{ backgroundColor: badge.bg }}
          >
            <img alt="" className="size-[20px]" src={badge.icon} />
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate font-['IBM_Plex_Sans'] text-[12px] font-bold leading-[16px] text-[#1e293b]">
              {badge.title}
            </p>
            <p className="m-0 truncate font-['IBM_Plex_Sans'] text-[10px] font-normal leading-[15px] text-[#94a3b8]">
              {badge.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>(getInitialMode);
  const copy = screenCopy[mode];
  const isMfa = mode === "mfa";
  const sectionClassName =
    "relative z-10 grid flex-1 items-start gap-[clamp(1.25rem,3.4vw,4rem)] pb-[clamp(1rem,2vh,2rem)] pt-[clamp(1.5rem,4vh,3rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]";

  const goToLogin = () => {
    setMode("login");
    window.history.replaceState(null, "", "/");
  };

  const goToForgot = () => {
    setMode("forgot");
    window.history.replaceState(null, "", "/forgot-password");
  };

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{ backgroundImage: pageBackground }}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-[clamp(1.5rem,4vw,3rem)] py-[clamp(0.75rem,2.4vh,2.5rem)]">
        <header className="relative z-20 flex shrink-0 items-center">
          <FigmaLogo className="origin-left -translate-x-[clamp(0.5rem,0.9vw,1rem)] scale-105 sm:scale-125" />
        </header>

        <section className={sectionClassName}>
          <div className="relative min-h-0 md:min-h-[600px] 2xl:min-h-[690px]">
            <div className="relative z-10 max-w-[620px]">
              <h1 className="m-0 font-['IBM_Plex_Sans'] text-[clamp(2.35rem,4vw,54px)] font-bold leading-[1.05] tracking-normal text-[#0f172a]">
                {copy.headline.map((line) => (
                  <span className="block" key={line}>
                    {line}
                  </span>
                ))}
                <span className="block bg-gradient-to-r from-[#ff6b35] to-[#0d00e9] bg-clip-text text-transparent">
                  {copy.accent}
                </span>
              </h1>
              <p className="m-0 mt-[16px] max-w-[620px] font-['IBM_Plex_Sans'] text-[clamp(1.05rem,1.45vw,20px)] font-normal leading-[1.56] text-[#64748b]">
                {copy.description}
              </p>
            </div>

            <div className="mt-[clamp(1rem,4vh,3.75rem)]">
              <FeatureList mode={mode} />
            </div>

            <img
              alt=""
              className="pointer-events-none absolute bottom-[-17rem] left-[-11rem] z-0 hidden w-[min(74vw,863px)] max-w-none select-none md:block lg:bottom-[-10rem]"
              draggable={false}
              src={image3}
            />
          </div>

          <div className="relative z-20 flex w-full flex-col items-center gap-[clamp(1.25rem,2.5vh,2rem)] lg:items-start">
            <LoginForm
              mode={mode}
              onBack={goToLogin}
              onForgot={goToForgot}
            />
            {!isMfa && <TrustBadges />}
          </div>
        </section>
      </div>
    </main>
  );
}
