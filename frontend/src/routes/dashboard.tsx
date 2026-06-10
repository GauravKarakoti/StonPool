import { useState } from 'react';
import { FadeUp } from '@/components/site/FadeUp';
import { TreasurySearchBar } from '@/components/dashboard/TreasurySearchBar';
import { TreasuryCard, StatChips } from '@/components/dashboard/TreasuryCard';
import { ProposalCard } from '@/components/dashboard/ProposalCard';
import { ApiError, fetchProposals, fetchTreasury, isApiError, type ProposalItem, type TreasuryResponse } from '@/lib/api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Treasury Dashboard — StonMaker' },
      {
        name: 'description',
        content: 'Inspect any StonMaker treasury — balance, members, proposals and on-chain activity.',
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [treasury, setTreasury] = useState<TreasuryResponse | null>(null);
  const [proposals, setProposals] = useState<{ active: ProposalItem[]; recent: ProposalItem[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const loadGroup = async (query: string) => {
    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const [treasuryData, proposalsData] = await Promise.all([
        fetchTreasury(query),
        fetchProposals(query),
      ]);
      setChatId(treasuryData.chatId ?? proposalsData.chatId ?? query);
      setTreasury(treasuryData);
      setProposals(proposalsData);
    } catch (err) {
      setTreasury(null);
      setProposals(null);
      setChatId(null);
      if (isApiError(err)) {
        setError(err.message);
      } else {
        setError('Failed to load group data. Is the API server running?');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const allProposals = [...(proposals?.active ?? []), ...(proposals?.recent ?? [])];
  const activeCount = proposals?.active.length ?? 0;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-radial-glow pointer-events-none" />
      <div className="relative mx-auto max-w-6xl px-6 pt-16 md:pt-24 pb-24">
        <FadeUp>
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              Treasury Dashboard
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Search by @username, invite link, or numeric chat ID.
            </p>
          </div>
        </FadeUp>

        <FadeUp delay={120}>
          <TreasurySearchBar onSearch={loadGroup} isLoading={isLoading} />
        </FadeUp>

        {hasSearched && (
          <>
            <div className="mt-16 grid lg:grid-cols-[1.4fr_1fr] gap-6">
              <FadeUp delay={200}>
                <TreasuryCard data={treasury} isLoading={isLoading} error={error} />
              </FadeUp>
              <FadeUp delay={300}>
                <StatChips data={treasury} isLoading={isLoading} />
              </FadeUp>
            </div>

            {!error && proposals && (
              <section className="mt-20">
                <FadeUp>
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Governance</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Proposals</h2>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block">
                      {activeCount} open · {allProposals.length} shown
                      {chatId ? ` · ${chatId}` : ''}
                    </p>
                  </div>
                </FadeUp>
                {allProposals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No proposals yet for this group.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {allProposals.map((p, i) => (
                      <FadeUp key={p.id} delay={i * 80}>
                        <ProposalCard p={p} />
                      </FadeUp>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
