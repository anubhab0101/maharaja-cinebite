// Adapted from VengeanceUI (MIT). See public/vengeance-ui-license.txt.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const CHARS = ".·─~+:=*#0123456789";
const DURATION = 850;

/** Decorative ripple with stable layout and a permanent screen-reader label. */
export default function AsciiGlitchRipple({ children, className }: { children: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const visual = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = host.current;
    const text = visual.current;
    if (!element || !text) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let active = false;
    const original = Array.from(children);
    const stop = () => {
      cancelAnimationFrame(frame);
      active = false;
      text.textContent = children;
    };
    const start = (event: PointerEvent) => {
      if (reduced.matches || active || document.hidden || !original.length) return;
      active = true;
      const bounds = element.getBoundingClientRect();
      const origin = Math.max(0, Math.min(original.length - 1,
        Math.floor(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * original.length)));
      const began = performance.now();
      const animate = (now: number) => {
        const elapsed = now - began;
        if (elapsed >= DURATION || reduced.matches || document.hidden) { stop(); return; }
        const radius = elapsed / DURATION * (Math.max(origin, original.length - origin - 1) + 5);
        text.textContent = original.map((char, index) => {
          const distance = radius - Math.abs(index - origin);
          return char !== " " && distance > 0 && distance <= 3
            ? CHARS[(Math.abs(index - origin) * 3 + Math.floor(elapsed / 40)) % CHARS.length]
            : char;
        }).join("");
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    };
    element.addEventListener("pointerenter", start);
    element.addEventListener("pointerdown", start);
    reduced.addEventListener("change", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      stop();
      element.removeEventListener("pointerenter", start);
      element.removeEventListener("pointerdown", start);
      reduced.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [children]);

  return (
    <span ref={host} className={cn("cine-ascii-ripple", className)}>
      <span className="sr-only">{children}</span>
      <span aria-hidden="true" className="cine-ascii-size">{children}</span>
      <span aria-hidden="true" ref={visual} className="cine-ascii-visual">{children}</span>
    </span>
  );
}
