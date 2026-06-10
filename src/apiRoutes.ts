import { Router, Request, Response } from 'express';
import type { Bot } from 'grammy';
import { Address } from '@ton/core';
import { createTonClient } from './tonNetwork';
import { prisma } from './db';
import { getProposalTypeBadge } from './formatters';
import { resolveGroupFromQuery } from './groupLookup';

const router: Router = Router();

async function getTonBalance(address: string): Promise<number | null> {
    try {
        const client = await createTonClient();
        const balance = await client.getBalance(Address.parse(address));
        return Number(balance) / 1e9;
    } catch (error) {
        console.error('Failed to fetch TON balance:', error);
        return null;
    }
}

function mapProposal(
    proposal: {
        id: number;
        action: string;
        text: string;
        status: string;
        expiresAt: Date | null;
        amount: number;
        tokenIn: string;
        tokenOut: string | null;
        destination: string | null;
        txHash: string | null;
        votes: { support: boolean }[];
    },
    totalMembers: number,
    quorumThreshold: number
) {
    const votesFor = proposal.votes.filter((v) => v.support).length;
    const votesAgainst = proposal.votes.filter((v) => !v.support).length;
    const requiredVotes = Math.ceil(totalMembers * (quorumThreshold / 100));

    let description = proposal.text;
    if (proposal.action === 'SWAP' && proposal.tokenOut) {
        description = `Swap ${proposal.amount} ${proposal.tokenIn} → ${proposal.tokenOut}`;
    } else if (proposal.action === 'STAKE') {
        description = `Add liquidity: ${proposal.amount} ${proposal.tokenIn}${proposal.tokenOut ? ` / ${proposal.tokenOut}` : ''}`;
    } else if (proposal.action === 'TRANSFER') {
        description = `Transfer ${proposal.amount} ${proposal.tokenIn}${proposal.destination ? ` to ${proposal.destination.slice(0, 6)}…${proposal.destination.slice(-4)}` : ''}`;
    }

    return {
        id: proposal.id,
        type: getProposalTypeBadge(proposal.action),
        action: proposal.action,
        description,
        votesFor,
        votesAgainst,
        totalMembers,
        requiredVotes,
        status: proposal.status,
        expiresAt: proposal.expiresAt?.toISOString() ?? null,
        txHash: proposal.txHash ?? null,
    };
}

function createGroupResolver(bot: Bot) {
    return (query: string) => resolveGroupFromQuery(query, bot.api);
}

router.get('/group/lookup', async (req: Request, res: Response) => {
    try {
        const bot = (req as Request & { bot?: Bot }).bot;
        if (!bot) {
            res.status(500).json({ error: 'Bot not configured' });
            return;
        }

        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!q) {
            res.status(400).json({ error: 'Missing search query' });
            return;
        }

        const resolved = await createGroupResolver(bot)(q);
        if (!resolved.ok) {
            res.status(resolved.status).json({ error: resolved.error });
            return;
        }

        res.json({
            chatId: resolved.chatId.toString(),
            groupName: resolved.groupName,
            telegramUsername: resolved.telegramUsername,
        });
    } catch (error) {
        console.error('API lookup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/group/:chatId/treasury', async (req: Request, res: Response) => {
    try {
        const bot = (req as Request & { bot?: Bot }).bot;
        if (!bot) {
            res.status(500).json({ error: 'Bot not configured' });
            return;
        }

        const chatIdParam = req.params.chatId;
        const chatIdStr = Array.isArray(chatIdParam) ? chatIdParam[0] : chatIdParam;
        if (!chatIdStr) {
            res.status(400).json({ error: 'Missing group identifier' });
            return;
        }

        const resolved = await createGroupResolver(bot)(decodeURIComponent(chatIdStr));
        if (!resolved.ok) {
            res.status(resolved.status).json({ error: resolved.error });
            return;
        }

        const group = await prisma.group.findUnique({
            where: { telegramChatId: resolved.chatId },
            include: { treasury: true },
        });

        if (!group || !group.treasury?.contractAddress) {
            res.status(404).json({ error: 'Group not found or treasury not initialized' });
            return;
        }

        const memberCount = await prisma.groupMember.count({
            where: { groupId: group.id, joinStatus: 'APPROVED' },
        });

        const proposalsExecuted = await prisma.proposal.count({
            where: { groupId: group.id, status: 'EXECUTED' },
        });

        const tonBalance = await getTonBalance(group.treasury.contractAddress);

        res.json({
            address: group.treasury.contractAddress,
            tonBalance,
            isFunded: tonBalance !== null && tonBalance > 0,
            memberCount,
            quorumThreshold: group.treasury.quorumThreshold,
            proposalsExecuted,
            groupName: group.name,
            chatId: resolved.chatId.toString(),
            telegramUsername: group.telegramUsername,
        });
    } catch (error) {
        console.error('API treasury error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/group/:chatId/proposals', async (req: Request, res: Response) => {
    try {
        const bot = (req as Request & { bot?: Bot }).bot;
        if (!bot) {
            res.status(500).json({ error: 'Bot not configured' });
            return;
        }

        const chatIdParam = req.params.chatId;
        const chatIdStr = Array.isArray(chatIdParam) ? chatIdParam[0] : chatIdParam;
        if (!chatIdStr) {
            res.status(400).json({ error: 'Missing group identifier' });
            return;
        }

        const resolved = await createGroupResolver(bot)(decodeURIComponent(chatIdStr));
        if (!resolved.ok) {
            res.status(resolved.status).json({ error: resolved.error });
            return;
        }

        const group = await prisma.group.findUnique({
            where: { telegramChatId: resolved.chatId },
            include: { treasury: true },
        });

        if (!group) {
            res.status(404).json({ error: 'Group not found' });
            return;
        }

        const totalMembers = await prisma.groupMember.count({
            where: { groupId: group.id, joinStatus: 'APPROVED' },
        });

        const quorumThreshold = group.treasury?.quorumThreshold ?? 60;

        const activeProposals = await prisma.proposal.findMany({
            where: { groupId: group.id, status: 'ACTIVE' },
            include: { votes: true },
            orderBy: { createdAt: 'desc' },
        });

        const recentProposals = await prisma.proposal.findMany({
            where: {
                groupId: group.id,
                status: { in: ['PASSED', 'REJECTED', 'EXECUTED', 'EXECUTING', 'FAILED'] },
            },
            include: { votes: true },
            orderBy: { updatedAt: 'desc' },
            take: 20,
        });

        res.json({
            chatId: resolved.chatId.toString(),
            active: activeProposals.map((p) => mapProposal(p, totalMembers, quorumThreshold)),
            recent: recentProposals.map((p) => mapProposal(p, totalMembers, quorumThreshold)),
        });
    } catch (error) {
        console.error('API proposals error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export function registerApiRoutes(app: import('express').Express, bot: Bot) {
    const defaultOrigins = 'http://localhost:8080,http://localhost:5173';
    const allowedOrigins = (process.env.FRONTEND_ORIGIN || defaultOrigins)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        } else if (!origin && allowedOrigins.length === 1) {
            res.header('Access-Control-Allow-Origin', allowedOrigins[0]!);
        }
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.sendStatus(204);
            return;
        }
        next();
    });

    app.use('/api', (req, _res, next) => {
        (req as Request & { bot?: Bot }).bot = bot;
        next();
    });

    app.use('/api', router);
}

export default router;
