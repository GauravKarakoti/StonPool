import { getHttpEndpoint } from '@orbs-network/ton-access';
import { TonClient } from '@ton/ton';

export type TonNetwork = 'mainnet' | 'testnet';

export function getTonNetwork(): TonNetwork {
    const network = process.env.TON_NETWORK?.toLowerCase();
    if (network === 'mainnet' || network === 'testnet') return network;
    // Default to testnet for safe development (matches 0Q/ kQ testnet wallet addresses)
    return 'testnet';
}

export async function createTonClient(): Promise<TonClient> {
    const endpoint = await getHttpEndpoint({ network: getTonNetwork() });
    return new TonClient({ endpoint });
}

export function getTonNetworkLabel(): string {
    return getTonNetwork() === 'mainnet' ? 'TON mainnet' : 'TON testnet';
}

const EXPLORER_BASE = {
    mainnet: 'https://tonscan.org',
    testnet: 'https://testnet.tonscan.org',
} as const;

/** Link to an address page on Tonscan (testnet or mainnet). */
export function getTonExplorerAccountUrl(address: string): string {
    const base = EXPLORER_BASE[getTonNetwork()];
    return `${base}/address/${encodeURIComponent(address)}`;
}

/** Link to a transaction on Tonscan. Hash may be hex or base64 depending on source. */
export function getTonExplorerTransactionUrl(txHash: string): string {
    const base = EXPLORER_BASE[getTonNetwork()];
    return `${base}/tx/${encodeURIComponent(txHash)}`;
}

export type ExecutionNotice = {
    chatId: number;
    proposalId: number;
    action: string;
    amount: number;
    tokenIn: string;
    treasuryAddress: string;
    destination?: string | null;
    txHash?: string | null;
};

function formatExecutionLinksHtml(notice: ExecutionNotice): string {
    const treasuryLink = getTonExplorerAccountUrl(notice.treasuryAddress);
    let text = `<b>Treasury:</b> <a href="${treasuryLink}">View on Tonscan</a>\n`;

    if (notice.destination) {
        const destLink = getTonExplorerAccountUrl(notice.destination);
        text += `<b>Destination:</b> <a href="${destLink}">View on Tonscan</a>\n`;
    }

    if (notice.txHash) {
        const txLink = getTonExplorerTransactionUrl(notice.txHash);
        text += `<b>Transaction:</b> <a href="${txLink}">View on Tonscan</a>\n`;
    }

    return text;
}

export function formatExecutionNoticeHtml(notice: ExecutionNotice): string {
    return (
        `✅ <b>Proposal #${notice.proposalId} executed on-chain</b>\n\n` +
        `<b>Action:</b> ${notice.action} ${notice.amount} ${notice.tokenIn}\n` +
        formatExecutionLinksHtml(notice)
    );
}

export function formatExecutionLinksBlockHtml(notice: ExecutionNotice): string {
    return `🔗 <b>On-chain</b>\n${formatExecutionLinksHtml(notice)}`;
}

export function formatExecutionNoticeLog(notice: ExecutionNotice): string {
    const lines = [
        `✅ Proposal #${notice.proposalId} successfully broadcasted!`,
        `   Treasury: ${getTonExplorerAccountUrl(notice.treasuryAddress)}`,
    ];
    if (notice.destination) {
        lines.push(`   Destination: ${getTonExplorerAccountUrl(notice.destination)}`);
    }
    if (notice.txHash) {
        lines.push(`   Transaction: ${getTonExplorerTransactionUrl(notice.txHash)}`);
    }
    return lines.join('\n');
}
