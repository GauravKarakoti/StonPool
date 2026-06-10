const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type TonNetwork = 'mainnet' | 'testnet';

function getTonNetwork(): TonNetwork {
  const network = import.meta.env.VITE_TON_NETWORK?.toLowerCase();
  return network === 'mainnet' ? 'mainnet' : 'testnet';
}

const EXPLORER_BASE = {
  mainnet: 'https://tonscan.org',
  testnet: 'https://testnet.tonscan.org',
} as const;

export function getTonExplorerAccountUrl(address: string): string {
  const base = EXPLORER_BASE[getTonNetwork()];
  return `${base}/address/${encodeURIComponent(address)}`;
}

export function getTonExplorerTransactionUrl(txHash: string): string {
  const base = EXPLORER_BASE[getTonNetwork()];
  return `${base}/tx/${encodeURIComponent(txHash)}`;
}

export type GroupLookupResponse = {
  chatId: string;
  groupName: string;
  telegramUsername: string | null;
};

export type TreasuryResponse = {
  address: string;
  tonBalance: number | null;
  isFunded: boolean;
  memberCount: number;
  quorumThreshold: number;
  proposalsExecuted: number;
  groupName?: string;
  chatId?: string;
  telegramUsername?: string | null;
};

export type ProposalItem = {
  id: number;
  type: string;
  action: string;
  description: string;
  votesFor: number;
  votesAgainst: number;
  totalMembers: number;
  requiredVotes: number;
  status: string;
  expiresAt: string | null;
  txHash: string | null;
};

export type ProposalsResponse = {
  chatId?: string;
  active: ProposalItem[];
  recent: ProposalItem[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError || (err instanceof Error && err.name === 'ApiError' && 'status' in err);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let message = 'Failed to load data';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore JSON parse errors
    }
    if (res.status === 404) throw new ApiError(message, 404);
    if (res.status === 400) throw new ApiError(message, 400);
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export function lookupGroup(query: string) {
  return fetchJson<GroupLookupResponse>(`/api/group/lookup?q=${encodeURIComponent(query.trim())}`);
}

export function fetchTreasury(groupQuery: string) {
  return fetchJson<TreasuryResponse>(`/api/group/${encodeURIComponent(groupQuery.trim())}/treasury`);
}

export function fetchProposals(groupQuery: string) {
  return fetchJson<ProposalsResponse>(`/api/group/${encodeURIComponent(groupQuery.trim())}/proposals`);
}

export function getTelegramBotUrl(): string {
  const username = (import.meta.env.VITE_BOT_USERNAME || 'StonMakerBot').replace(/^@/, '');
  return `https://t.me/${username}?start=add`;
}

export function formatExpiresIn(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry set';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.ceil(ms / (1000 * 60 * 60));
  if (hours >= 24 * 7) {
    const weeks = Math.ceil(hours / (24 * 7));
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  if (hours >= 24) {
    const days = Math.ceil(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function getProposalTypeBadge(action: string): string {
  switch (action) {
    case 'SWAP':
      return 'Swap';
    case 'STAKE':
      return 'Add Liquidity';
    case 'TRANSFER':
      return 'Transfer';
    default:
      return action;
  }
}
