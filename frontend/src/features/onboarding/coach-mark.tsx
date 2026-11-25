import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./onboarding-context";

type Step = { number: number; title: string; description: string };
type Position = { left: number; top: number; arrow: number; placement: "above" | "below" };

function CoachBubble({ id, step, anchor }: {
  id: string;
  step: Step;
  anchor: HTMLElement;
}) {
  const onboarding = useOnboarding();
  const bubbleRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const gutter = 16;
    const gap = 12;
    const update = () => {
      const target = anchor.getBoundingClientRect();
      const { width, height } = bubble.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const topEdge = 72;
      const bottomEdge = window.innerHeight - (viewportWidth < 1024 ? 76 : gutter);
      if (target.bottom <= topEdge || target.top >= bottomEdge) {
        setPosition(null);
        return;
      }
      const center = (target.left + target.right) / 2;
      const left = Math.min(Math.max(center - width / 2, gutter), viewportWidth - width - gutter);
      const placement = target.bottom + gap + height <= bottomEdge ||
        target.top - topEdge < bottomEdge - target.bottom ? "below" : "above";
      const top = placement === "below" ? target.bottom + gap : target.top - height - gap;
      const arrow = Math.min(Math.max(center - left, gutter), width - gutter);
      setPosition({ left, top, arrow, placement });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(bubble);
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor]);

  function skip() {
    anchor.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    onboarding?.finish();
  }

  return (
    <section
      ref={bubbleRef}
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          skip();
        }
      }}
      className="splitcircle-coach fixed z-40 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-surface p-4 text-left text-ink shadow-lg"
      data-ready={position ? "" : undefined}
      data-placement={position?.placement}
      style={{ left: position?.left ?? 16, top: position?.top ?? 72, visibility: position ? "visible" : "hidden" }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-2.5 -translate-x-1/2 rotate-45 border-border-subtle bg-surface"
        style={position?.placement === "above"
          ? { left: position.arrow, bottom: -6, borderRightWidth: 1, borderBottomWidth: 1 }
          : { left: position?.arrow, top: -6, borderLeftWidth: 1, borderTopWidth: 1 }}
      />
      <p className="mb-1 text-xs font-semibold text-accent">Step {step.number} of 3</p>
      <h2 id={`${id}-title`} className="text-sm font-semibold">{step.title}</h2>
      <p id={id} className="mt-1 text-sm leading-relaxed text-ink-secondary">{step.description}</p>
      <Button variant="ghost" size="sm" className="mt-2 -ml-2 min-h-10 px-2" onClick={skip}>
        Skip tour
      </Button>
    </section>
  );
}

export function CoachMark({ step, children }: {
  step?: Step;
  children: (descriptionId?: string) => ReactNode;

}) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setAnchor} className="inline-flex">
      {children(step ? id : undefined)}
      {step && anchor && <CoachBubble key={step.number} id={id} step={step} anchor={anchor} />}
    </div>
  );
}
