import { Copy, Check, Users, Gauge, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { TreasuryResponse } from '@/lib/api';
import { getTonExplorerAccountUrl } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

type TreasuryCardProps = {
  data: TreasuryResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function TreasuryCard({ data, isLoading, error }: TreasuryCardProps) {
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-8">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-6 w-40 mb-8" />
        <Skeleton className="h-16 w-48" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card rounded-2xl p-8 flex items-start gap-4">
        <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">{error || 'Group not found'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Make sure the group has used <code>/join_dao</code> with the bot at least once.
          </p>
        </div>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(data.address);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 1600);
  };

  const notDeployed = data.tonBalance === null || !data.isFunded;

  return (
    <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Treasury</p>
        {data.groupName && (
          <p className="mt-1 text-sm text-muted-foreground">{data.groupName}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={copy}
            className="group inline-flex items-center gap-2 text-sm text-foreground/90 hover:text-foreground transition-colors"
          >
            <span className="font-mono">{truncate(data.address)}</span>
            {copied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </button>
          <a
            href={getTonExplorerAccountUrl(data.address)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            View on Tonscan
            <ExternalLink className="size-3" />
          </a>
        </div>

        {notDeployed ? (
          <div className="mt-8 rounded-xl border border-border/80 bg-surface/40 p-5">
            <p className="text-sm font-medium text-foreground">Treasury not yet deployed</p>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              This counterfactual address is ready to receive funds. Send TON to activate the treasury.
            </p>
            <button
              onClick={copy}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 text-xs text-foreground hover:bg-surface hover:border-primary/40 transition-all"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              Copy Address
            </button>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Balance</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl md:text-6xl font-semibold tracking-tight tabular-nums headline-gradient">
                {data.tonBalance!.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </span>
              <span className="text-lg text-muted-foreground font-medium">TON</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StatChips({ data, isLoading }: { data: TreasuryResponse | null; isLoading: boolean }) {
  const items = [
    { Icon: Users, label: 'Members approved', value: data?.memberCount?.toString() ?? '—' },
    { Icon: Gauge, label: 'Quorum threshold', value: data ? `${data.quorumThreshold}%` : '—' },
    { Icon: CheckCircle2, label: 'Proposals executed', value: data?.proposalsExecuted?.toString() ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {items.map((it) => (
        <div
          key={it.label}
          className="glass-card rounded-2xl p-5 flex items-center gap-4 transition-all hover:border-primary/30 hover:-translate-y-0.5"
        >
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <it.Icon className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-xl font-semibold tracking-tight tabular-nums">{it.value}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
