import { ExternalLink } from "lucide-react";
import { ACTIVITY } from "@/lib/mock-data";

export function ActivityTimeline() {
  return (
    <ul className="relative">
      {ACTIVITY.map((a, i) => (
        <li
          key={a.id}
          className="group relative grid grid-cols-[12px_1fr_auto] gap-4 items-start py-5 border-b border-border/60 last:border-b-0"
        >
          <div className="relative flex justify-center pt-2">
            <span className="size-1.5 rounded-full bg-primary/60 group-hover:bg-primary transition-colors" />
            {i < ACTIVITY.length - 1 && (
              <span className="absolute top-4 left-1/2 -translate-x-1/2 h-full w-px bg-border" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-foreground/90">{a.action}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.timestamp}</p>
          </div>
          <a
            href={`https://tonviewer.com/transaction/${a.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5"
          >
            {a.txHash}
            <ExternalLink className="size-3" />
          </a>
        </li>
      ))}
    </ul>
  );
}
