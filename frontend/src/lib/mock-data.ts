export type Proposal = {
  id: string;
  type: "SWAP" | "TRANSFER";
  description: string;
  forPct: number;
  againstPct: number;
  status: "ACTIVE" | "PASSED" | "REJECTED";
};

export type Activity = {
  id: string;
  action: string;
  timestamp: string;
  txHash: string;
};

export const TREASURY = {
  address: "EQAbX7K9p2vQmFhJ4nN3rZ8tYwL6kCzD1eRsHgQ7M2x5K9pV",
  balance: "12,438.27",
  members: 248,
  quorum: 60,
  executed: 37,
};

export const PROPOSALS: Proposal[] = [
  { id: "p1", type: "SWAP", description: "Swap 10 TON → USDT for treasury diversification", forPct: 68, againstPct: 32, status: "ACTIVE" },
  { id: "p2", type: "TRANSFER", description: "Transfer 500 TON to community grants multisig", forPct: 81, againstPct: 19, status: "ACTIVE" },
  { id: "p3", type: "SWAP", description: "Swap 2,000 USDT → TON to rebalance positions", forPct: 54, againstPct: 46, status: "ACTIVE" },
  { id: "p4", type: "TRANSFER", description: "Pay Q2 contributor stipends (8 recipients)", forPct: 92, againstPct: 8, status: "PASSED" },
];

export const ACTIVITY: Activity[] = [
  { id: "a1", action: "Proposal #37 executed — Transfer 120 TON", timestamp: "2h ago", txHash: "0x9f3e…b81a" },
  { id: "a2", action: "Vote cast on Proposal #41 by @alex.ton", timestamp: "4h ago", txHash: "0x2d1c…77ef" },
  { id: "a3", action: "New member approved — @kira", timestamp: "1d ago", txHash: "0xa83b…0c19" },
  { id: "a4", action: "Quorum threshold updated to 60%", timestamp: "2d ago", txHash: "0x5e6f…44a1" },
  { id: "a5", action: "Swap executed — 50 TON → 295 USDT", timestamp: "3d ago", txHash: "0xc1b2…9d72" },
];
