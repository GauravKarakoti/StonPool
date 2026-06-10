import type { ReactNode, CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const style: CSSProperties = { animationDelay: `${delay}ms` };
  return <div className={cn("animate-fade-up", className)} style={style}>{children}</div>;
}
