import { ExternalLink } from 'lucide-react';
import type { ProposalItem } from '@/lib/api';
import { formatExpiresIn, getProposalTypeBadge, getTonExplorerTransactionUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ProposalCard({ p }: { p: ProposalItem }) {
  const isActive = p.status === 'ACTIVE';
  const totalVotes = p.votesFor + p.votesAgainst;
  const forPct = totalVotes > 0 ? Math.round((p.votesFor / totalVotes) * 100) : 0;
  const againstPct = totalVotes > 0 ? Math.round((p.votesAgainst / totalVotes) * 100) : 0;
  const typeLabel = getProposalTypeBadge(p.action);
  const isSwap = p.action === 'SWAP';
  const isLp = p.action === 'STAKE';

  return (
    <div className="glass-card rounded-2xl p-5 md:p-6 transition-all hover:border-primary/30 hover:-translate-y-0.5 grid md:grid-cols-[140px_1fr_240px] gap-5 md:gap-8 items-center">
      <div>
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wider',
            isSwap && 'bg-primary/10 text-primary border border-primary/20',
            isLp && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
            !isSwap && !isLp && 'bg-warning/10 text-warning border border-warning/20'
          )}
        >
          {typeLabel}
        </span>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Expires in {formatExpiresIn(p.expiresAt)}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-sm md:text-[15px] text-foreground leading-snug">{p.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">#proposal-{p.id}</p>
        {p.status === 'EXECUTED' && p.txHash && (
          <a
            href={getTonExplorerTransactionUrl(p.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            View transaction on Tonscan
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            <span className="text-success font-medium tabular-nums">{p.votesFor}</span> for
          </span>
          <span>
            <span className="text-foreground/70 font-medium tabular-nums">{p.votesAgainst}</span> against
          </span>
        </div>
        <div className="h-1 rounded-full bg-surface-elevated overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-glow"
            style={{ width: `${forPct}%` }}
          />
          <div className="h-full bg-muted-foreground/30" style={{ width: `${againstPct}%` }} />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">
            Quorum: {p.requiredVotes}/{p.totalMembers}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide border',
              isActive && 'bg-primary/10 text-primary border-primary/20',
              p.status === 'PASSED' && 'bg-success/10 text-success border-success/20',
              p.status === 'EXECUTED' && 'bg-success/10 text-success border-success/20',
              p.status === 'REJECTED' && 'bg-destructive/10 text-destructive border-destructive/20'
            )}
          >
            {isActive && <span className="size-1.5 rounded-full bg-primary animate-soft-pulse" />}
            {p.status}
          </span>
        </div>
      </div>
    </div>
  );
}
