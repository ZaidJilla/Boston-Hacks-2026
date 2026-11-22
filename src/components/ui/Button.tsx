import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "dark" | "outline";

/** Pill buttons. primary = T blue, dark = black, outline = 2px black border. 48px tall. */
export const buttonClass = (variant: ButtonVariant = "primary") =>
  `inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-[16px] font-extrabold tracking-[-0.2px] transition-transform duration-100 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 ${
    variant === "primary"
      ? "bg-line-blue text-white"
      : variant === "dark"
        ? "bg-ink text-white"
        : "border-2 border-ink bg-white text-ink"
  }`;

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  // No default `type`: inside a form this stays a submit button, as before.
  return <button className={`${buttonClass(variant)} ${className}`} {...props} />;
}

/** Outline chip: 36px visual, 44px tap area. Selected = black fill (or amber with `accent`). */
export const chipClass = (selected = false, accent = false) =>
  `hit-44 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 px-4 text-[14px] font-bold transition-transform duration-100 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${
    selected
      ? accent
        ? "border-signal bg-signal text-ink"
        : "border-ink bg-ink text-white"
      : "border-ink bg-white text-ink"
  }`;

export function Chip({
  selected = false,
  accent = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; accent?: boolean }) {
  return <button type="button" aria-pressed={selected} className={`${chipClass(selected, accent)} ${className}`} {...props} />;
}
