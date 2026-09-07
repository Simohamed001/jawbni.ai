import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }
>(({ className, variant = "primary", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
      variant === "primary" && "bg-[#25D366] text-white hover:bg-[#1faa52]",
      variant === "ghost" && "bg-transparent hover:bg-black/5",
      variant === "outline" && "border border-gray-300 bg-white hover:bg-gray-50",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366]",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366]",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
