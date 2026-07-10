import { type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-[#1f65ff] text-white shadow-[0_14px_30px_rgba(31,101,255,0.24)] hover:bg-[#1857dd] focus-visible:outline-[#1f65ff]",
        variant === "ghost" &&
          "bg-white text-[#344054] ring-1 ring-[#d6dce8] hover:bg-[#f8fafc] focus-visible:outline-[#98a2b3]",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
