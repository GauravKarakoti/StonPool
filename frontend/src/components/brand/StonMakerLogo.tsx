import { cn } from "@/lib/utils";

export function StonMakerLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold tracking-tight text-foreground", className)}>
      <span>Ston</span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="-mt-0.5">
        <path
          d="M7 0.5 L13.5 7 L7 13.5 L0.5 7 Z"
          fill="url(#ston-diamond)"
          stroke="color-mix(in oklab, white 18%, transparent)"
          strokeWidth="0.5"
        />
        <defs>
          <linearGradient id="ston-diamond" x1="0" y1="0" x2="14" y2="14">
            <stop offset="0%" stopColor="#5BC0FF" />
            <stop offset="100%" stopColor="#0098EA" />
          </linearGradient>
        </defs>
      </svg>
      <span>Maker</span>
    </span>
  );
}
