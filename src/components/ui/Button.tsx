import type { ButtonHTMLAttributes } from "react";

export default function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded-lg bg-line-blue px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
