import { Bot } from "lucide-react";
import { cn } from "../../lib/cn";

type LogoProps = {
  className?: string;
  markOnly?: boolean;
};

export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex size-10 items-center justify-center rounded-lg bg-[#1f65ff] text-white shadow-[0_12px_30px_rgba(31,101,255,0.22)]">
        <Bot aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </div>
      {!markOnly && (
        <div className="leading-none">
          <p className="text-[15px] font-semibold text-[#101828]">
            Agentic Sales
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#697586]">
            Intelligence Agent
          </p>
        </div>
      )}
    </div>
  );
}
