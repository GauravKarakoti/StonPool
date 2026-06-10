import type { Bot } from 'grammy';
import { prisma } from './db';

export type GroupLookupResult =
    | { ok: true; chatId: bigint; groupName: string; telegramUsername: string | null }
    | { ok: false; status: 400 | 404; error: string };

type ParsedQuery =
    | { kind: 'chatId'; chatId: bigint }
    | { kind: 'username'; username: string }
    | { kind: 'invite'; hash: string }
    | { kind: 'name'; name: string };

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

export function parseGroupQuery(raw: string): ParsedQuery | null {
    const input = raw.trim();
    if (!input) return null;

    if (/^-?\d+$/.test(input)) {
        return { kind: 'chatId', chatId: BigInt(input) };
    }

    const inviteMatch =
        input.match(/(?:https?:\/\/)?t\.me\/\+([A-Za-z0-9_-]+)/i) ||
        input.match(/(?:https?:\/\/)?t\.me\/joinchat\/([A-Za-z0-9_-]+)/i);
    if (inviteMatch?.[1]) {
        return { kind: 'invite', hash: inviteMatch[1] };
    }

    const tmeUserMatch = input.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/i);
    if (tmeUserMatch?.[1] && !['joinchat', 'addstickers', 'share'].includes(tmeUserMatch[1].toLowerCase())) {
        return { kind: 'username', username: tmeUserMatch[1].toLowerCase() };
    }

    const atUser = input.startsWith('@') ? input.slice(1) : input;
    if (USERNAME_RE.test(atUser)) {
        return { kind: 'username', username: atUser.toLowerCase() };
    }

    if (input.startsWith('+') && input.length > 8) {
        return { kind: 'invite', hash: input.slice(1) };
    }

    // Exact group title match (e.g. "Test StonPool")
    if (input.length >= 2 && !input.includes('/')) {
        return { kind: 'name', name: input };
    }

    return null;
}

export async function syncGroupTelegramMeta(botApi: Bot['api'], chatTgId: number): Promise<void> {
    try {
        const chat = await botApi.getChat(chatTgId);
        const data: { telegramUsername?: string | null; inviteLink?: string | null } = {};

        if ('username' in chat && chat.username) {
            data.telegramUsername = chat.username.toLowerCase();
        }

        if ('invite_link' in chat && chat.invite_link) {
            data.inviteLink = chat.invite_link;
        } else {
            try {
                data.inviteLink = await botApi.exportChatInviteLink(chatTgId);
            } catch {
                // Bot may not be admin — invite link stays unset until Telegram exposes one.
            }
        }

        await prisma.group.updateMany({
            where: { telegramChatId: BigInt(chatTgId) },
            data,
        });
    } catch (error) {
        console.log(`Could not sync Telegram metadata for chat ${chatTgId}:`, error);
    }
}

export async function syncAllKnownGroupsTelegramMeta(botApi: Bot['api']): Promise<void> {
    const groups = await prisma.group.findMany({ select: { telegramChatId: true } });
    for (const group of groups) {
        await syncGroupTelegramMeta(botApi, Number(group.telegramChatId));
    }
}

async function findGroupByChatId(chatId: bigint) {
    return prisma.group.findUnique({
        where: { telegramChatId: chatId },
        include: { treasury: true },
    });
}

async function resolveUsernameViaTelegram(botApi: Bot['api'], username: string): Promise<bigint | null> {
    try {
        const chat = await botApi.getChat(`@${username}`);
        if (chat.type === 'private') return null;
        return BigInt(chat.id);
    } catch {
        return null;
    }
}

export async function resolveGroupFromQuery(query: string, botApi?: Bot['api']): Promise<GroupLookupResult> {
    const parsed = parseGroupQuery(query);
    if (!parsed) {
        return {
            ok: false,
            status: 400,
            error: 'Enter a numeric chat ID, @group username, or t.me invite link.',
        };
    }

    if (parsed.kind === 'chatId') {
        const group = await findGroupByChatId(parsed.chatId);
        if (!group) {
            return {
                ok: false,
                status: 404,
                error: 'Group not found. Add the bot to the group and run /join_dao first.',
            };
        }
        return {
            ok: true,
            chatId: parsed.chatId,
            groupName: group.name,
            telegramUsername: group.telegramUsername,
        };
    }

    if (parsed.kind === 'username') {
        let group = await prisma.group.findFirst({
            where: { telegramUsername: parsed.username },
            include: { treasury: true },
        });

        if (!group && botApi) {
            const chatId = await resolveUsernameViaTelegram(botApi, parsed.username);
            if (chatId) {
                group = await findGroupByChatId(chatId);
            }
        }

        if (!group) {
            return {
                ok: false,
                status: 404,
                error: 'Group not found. Use a public @username where the bot is a member, or try the invite link.',
            };
        }

        return {
            ok: true,
            chatId: group.telegramChatId,
            groupName: group.name,
            telegramUsername: group.telegramUsername,
        };
    }

    if (parsed.kind === 'name') {
        const group = await prisma.group.findFirst({
            where: { name: { equals: parsed.name, mode: 'insensitive' } },
            include: { treasury: true },
        });

        if (!group) {
            return {
                ok: false,
                status: 404,
                error: 'No group with that name. Try the exact Telegram group title, @username, or chat ID from /dashboard.',
            };
        }

        return {
            ok: true,
            chatId: group.telegramChatId,
            groupName: group.name,
            telegramUsername: group.telegramUsername,
        };
    }

    const group = await prisma.group.findFirst({
        where: {
            inviteLink: { contains: parsed.hash, mode: 'insensitive' },
        },
        include: { treasury: true },
    });

    if (!group) {
        return {
            ok: false,
            status: 404,
            error: 'Invite link not recognized. Open the group in Telegram and run /join_dao so the bot can save its link.',
        };
    }

    return {
        ok: true,
        chatId: group.telegramChatId,
        groupName: group.name,
        telegramUsername: group.telegramUsername,
    };
}
