import { type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
};

export function Input({ className, icon, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-2 block text-sm font-semibold text-[#344054]">
        {label}
      </span>
      <span className="relative block">
        {icon && (
          <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2 text-[#98a2b3]">
            {icon}
          </span>
        )}
        <input
          className={cn(
            "h-12 w-full rounded-lg border border-[#d6dce8] bg-white px-4 text-[15px] text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#1f65ff] focus:ring-4 focus:ring-[#1f65ff]/10",
            icon && "pl-11",
            className,
          )}
          id={inputId}
          {...props}
        />
      </span>
    </label>
  );
}
