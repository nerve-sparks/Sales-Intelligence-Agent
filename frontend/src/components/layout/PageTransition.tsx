import type { ReactNode } from "react";

/* Wraps a routed page so it fades in on mount instead of snapping in -
   client-side navigation (Sidebar's Link) swaps this in fresh each time,
   which replays the animation; full browser reloads (window.location.href
   elsewhere in the app) replay it too since the whole tree remounts. */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="page-fade-in">{children}</div>;
}
