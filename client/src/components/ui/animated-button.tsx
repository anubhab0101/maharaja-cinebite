// Adapted from VengeanceUI (MIT). See public/vengeance-ui-license.txt.
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Native button semantics; an interaction-only shine keeps labels readable. */
export default function AnimatedButton({ children, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn("cine-animated-button", className)} {...props}>
      {children}
      <span aria-hidden="true" className="cine-button-shine" />
    </button>
  );
}
