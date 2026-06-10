import { formatExpiresIn } from './durationUtils';

export type ProposalForFormat = {
    id: number;
    action: string;
    amount: number;
    tokenIn: string;
    tokenOut?: string | null;
    destination?: string | null;
    expiresAt?: Date | null;
    status?: string;
};

export type ProposerForFormat = {
    username?: string | null;
    firstName?: string | null;
};

export function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function getActionDisplayName(action: string): string {
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

export function getActionEmoji(action: string): string {
    switch (action) {
        case 'SWAP':
            return '🔄';
        case 'STAKE':
            return '💧';
        case 'TRANSFER':
            return '💸';
        default:
            return '📋';
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function proposerLabel(proposer: ProposerForFormat): string {
    if (proposer.username) return `@${escapeHtml(proposer.username)}`;
    return escapeHtml(proposer.firstName || 'Unknown');
}

function buildActionLine(proposal: ProposalForFormat): string {
    const amount = proposal.amount;
    const tokenIn = escapeHtml(proposal.tokenIn);

    if (proposal.action === 'SWAP') {
        const tokenOut = escapeHtml(proposal.tokenOut || '?');
        return `Swap ${amount} ${tokenIn} → ${tokenOut}`;
    }
    if (proposal.action === 'STAKE') {
        const paired = escapeHtml(proposal.tokenOut || 'USDT');
        return `Add liquidity: ${amount} ${tokenIn} / ${paired}`;
    }
    if (proposal.action === 'TRANSFER') {
        return `Send ${amount} ${tokenIn}`;
    }
    return `${amount} ${tokenIn}`;
}

export function formatProposalMessage(
    proposal: ProposalForFormat,
    proposer: ProposerForFormat,
    options: {
        yesVotes: number;
        noVotes: number;
        requiredQuorum: number;
        totalEligible: number;
        concluded?: boolean;
        conclusionStatus?: string;
        executionLinks?: string;
    }
): string {
    const typeLabel = getActionDisplayName(proposal.action);
    const emoji = getActionEmoji(proposal.action);
    const expiresLabel = formatExpiresIn(proposal.expiresAt);
    const expiresLine = proposal.expiresAt
        ? `⏳ <b>Voting closes:</b> in ${expiresLabel}`
        : `⏳ <b>Voting closes:</b> ${expiresLabel}`;

    let lines = [
        `📋 <b>New Proposal #${proposal.id}</b>`,
        '',
        `<b>Type:</b>    ${emoji} ${typeLabel}`,
        `<b>Action:</b>  ${escapeHtml(buildActionLine(proposal))}`,
    ];

    if (proposal.action === 'SWAP' || proposal.action === 'STAKE') {
        lines.push(`<b>From:</b>    Treasury`);
        lines.push(`<b>Via:</b>     STON.fi`);
    }

    if (proposal.action === 'TRANSFER' && proposal.destination) {
        lines.push(`<b>To:</b>      <code>${escapeHtml(truncateAddress(proposal.destination))}</code>`);
    }

    lines.push(
        '',
        `👤 <b>Proposed by:</b> ${proposerLabel(proposer)}`,
        expiresLine,
        '',
        '━━━━━━━━━━━━━━━',
        `👍 ${options.yesVotes} votes for   |   👎 ${options.noVotes} votes against`,
    );

    const quorumPct =
        options.totalEligible > 0
            ? Math.round((options.requiredQuorum / options.totalEligible) * 100)
            : 60;
    lines.push(`Quorum needed: ${quorumPct}% (${options.requiredQuorum} members must vote)`);
    lines.push('━━━━━━━━━━━━━━━');

    if (options.concluded && options.conclusionStatus) {
        const icon =
            options.conclusionStatus === 'PASSED' || options.conclusionStatus === 'EXECUTED'
                ? '✅'
                : '❌';
        const label =
            options.conclusionStatus === 'EXECUTED'
                ? 'Executed on-chain'
                : `Voting Concluded: ${options.conclusionStatus}`;
        lines.push('', `🏁 <b>${label} ${icon}</b>`);
    }

    if (options.executionLinks) {
        lines.push('', options.executionLinks);
    }

    return lines.join('\n');
}

export function getProposalActionTypeLabel(action: string): string {
    return getActionDisplayName(action).toUpperCase().replace(' ', '_') === 'ADD_LIQUIDITY'
        ? 'Add Liquidity'
        : getActionDisplayName(action);
}

/** Frontend/API display label for proposal action types */
export function getProposalTypeBadge(action: string): string {
    return getActionDisplayName(action);
}
