import { type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const inputId = id ?? props.name;

  return (
    <label
      className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475467]"
      htmlFor={inputId}
    >
      <input
        className={cn(
          "size-4 rounded border-[#cfd7e6] text-[#1f65ff] accent-[#1f65ff] focus:ring-[#1f65ff]",
          className,
        )}
        id={inputId}
        type="checkbox"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
