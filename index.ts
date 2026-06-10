import 'dotenv/config';
import { Bot, GrammyError, HttpError, InlineKeyboard, Keyboard } from 'grammy';
import {
    processJoinDaoRequest,
    saveUserWallet,
    resolveJoinRequest,
    createProposal,
    castVote,
    getGroupTreasuryAddress,
    getTreasuryBalance,
    markAdminNotified,
    shouldNotifyAdminsInGroup,
    syncAdminRole,
    syncAdminRolesForUserInKnownGroups,
    saveProposalTelegramMessageId,
    saveGroupInviteLink,
    prisma,
} from './src/daoService';
import { parseProposalIntent, type ProposalIntent } from './src/aiService';
import { startExecutionWorker } from './src/workerService';
import { registerApiRoutes } from './src/apiRoutes';
import { formatProposalMessage } from './src/formatters';
import { parseDurationToHours, formatDurationFromHours } from './src/durationUtils';
import { getTonNetworkLabel, formatExecutionNoticeHtml, formatExecutionLinksBlockHtml, type ExecutionNotice } from './src/tonNetwork';
import { syncGroupTelegramMeta, syncAllKnownGroupsTelegramMeta } from './src/groupLookup';
import express from 'express';

const bot = new Bot(process.env.BOT_TOKEN as string);
const app = express();
const botUsername = process.env.BOT_USERNAME || '';

const ADD_GROUP_REQUEST_ID = 42;

const NO_ADMIN_RIGHTS = {
    is_anonymous: false,
    can_manage_chat: false,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: false,
    can_post_stories: false,
    can_edit_stories: false,
    can_delete_stories: false,
    can_post_messages: false,
    can_edit_messages: false,
    can_pin_messages: false,
};

/** Minimal admin rights so Telegram prompts to add the bot when a group is selected. */
const BOT_ADD_RIGHTS = {
    ...NO_ADMIN_RIGHTS,
    can_manage_chat: true,
};

const USER_PICK_GROUP_RIGHTS = {
    ...NO_ADMIN_RIGHTS,
    can_manage_chat: true,
    can_invite_users: true,
};

function createSelectGroupKeyboard(): Keyboard {
    return new Keyboard()
        .add({
            text: '📋 Select your group',
            request_chat: {
                request_id: ADD_GROUP_REQUEST_ID,
                chat_is_channel: false,
                bot_is_member: false,
                user_administrator_rights: USER_PICK_GROUP_RIGHTS,
                bot_administrator_rights: BOT_ADD_RIGHTS,
            },
        })
        .resized()
        .oneTime();
}

const GROUP_WELCOME_MESSAGE =
    '👋 <b>StonMaker is in your group.</b>\n\n' +
    '• Members: <code>/join_dao</code>\n' +
    '• Treasury: <code>/treasury</code>\n' +
    '• Proposals: <code>/propose</code> (members only)\n' +
    '• Help: <code>/help</code>';

const PRIVATE_ADD_INSTRUCTIONS =
    '<b>Add StonMaker to your Telegram group</b>\n\n' +
    '1. Tap <b>Select your group</b> below\n' +
    '2. Pick the group (you must be an admin)\n' +
    '3. Tap <b>OK</b> when Telegram asks to add StonMaker\n\n' +
    '<i>Telegram requires these steps — websites cannot add bots to a group automatically.</i>';

/** Users awaiting a voting duration reply before proposal is created */
const pendingProposalIntents = new Map<
    string,
    { rawText: string; intent: ProposalIntent; loadingMessageId?: number; chatId: number }
>();

function pendingKey(chatId: number, userId: number) {
    return `${chatId}_${userId}`;
}

const HELP_MESSAGE = `
🤖 <b>StonMaker DAO Bot - Help Menu</b>

Here are the commands and actions you can use to interact with the DAO:

<b>Commands:</b>
• <code>/join_dao</code> - Request to join the group's DAO. Admins will review your request.
• <code>/treasury</code> - View the group's Treasury Dashboard and counterfactual smart contract wallet address.
• <code>/balance</code> - Check the current TON balance of the group treasury.
• <code>/dashboard</code> - Show how to find this group on the web dashboard.
• <code>/set_invite &lt;link&gt;</code> - (Admins) Save the group invite link for dashboard search.

<b>Actions:</b>
• <b>Propose an Investment:</b> Use <code>/propose &lt;details&gt;</code> to create a new DeFi proposal.
  <i>Example:</i> <code>/propose SWAP 10 TON for USDT voting 24h</code>
• <b>Link Wallet:</b> Reply directly to the bot's wallet request message with your 48-character TON Wallet Address to link it to your profile.

<i>Note: Only approved DAO members can introduce or vote on investment proposals.</i>
`;

async function notifyAdminsOnceInGroup(
    ctx: { api: Bot['api']; chat: { id: number }; me: { username?: string } },
    successfulDMs: number
) {
    if (successfulDMs > 0) return;
    const shouldNotify = await shouldNotifyAdminsInGroup(ctx.chat.id);
    if (!shouldNotify) return;

    const username = botUsername || ctx.me.username || 'StonMakerBot';
    await ctx.api.sendMessage(
        ctx.chat.id,
        `📬 <b>Admins</b> — to receive approval requests, please start a private chat with me first: t.me/${username}`,
        { parse_mode: 'HTML' }
    );
    await markAdminNotified(ctx.chat.id);
}

async function syncGroupAdmins(chatId: number) {
    try {
        const admins = await bot.api.getChatAdministrators(chatId);
        for (const admin of admins) {
            if (admin.user.is_bot) continue;
            await syncAdminRole(admin.user.id, chatId, true);
        }
    } catch (error) {
        console.log('Could not sync group admins:', error);
    }
}

async function isGroupAdmin(api: Bot['api'], chatId: number, userId: number): Promise<boolean> {
    try {
        const member = await api.getChatMember(chatId, userId);
        return member.status === 'creator' || member.status === 'administrator';
    } catch {
        return false;
    }
}

async function postProposalMessage(
    chatId: number,
    messageId: number,
    proposal: {
        id: number;
        action: string;
        amount: number;
        tokenIn: string;
        tokenOut?: string | null;
        destination?: string | null;
        expiresAt?: Date | null;
    },
    proposer: { username?: string | null; firstName?: string | null },
    voteStats: { yesVotes: number; noVotes: number; requiredQuorum: number; totalEligible: number },
    concluded?: boolean,
    conclusionStatus?: string
) {
    const text = formatProposalMessage(proposal, proposer, {
        ...voteStats,
        concluded,
        conclusionStatus,
    });

    const votingKeyboard = new InlineKeyboard()
        .text(`👍 Approve (${voteStats.yesVotes})`, `v_yes_${proposal.id}`)
        .text(`👎 Reject (${voteStats.noVotes})`, `v_no_${proposal.id}`);

    await bot.api.editMessageText(chatId, messageId, text, {
        parse_mode: 'HTML',
        reply_markup: concluded ? undefined : votingKeyboard,
    });
}

async function notifyProposalExecuted(notice: ExecutionNotice) {
    const proposal = await prisma.proposal.findUnique({
        where: { id: notice.proposalId },
        include: {
            proposer: true,
            votes: true,
            group: { include: { treasury: true } },
        },
    });
    if (!proposal) return;

    const totalMembers = await prisma.groupMember.count({
        where: { groupId: proposal.groupId, joinStatus: 'APPROVED' },
    });
    const quorumThreshold = proposal.group.treasury?.quorumThreshold ?? 60;
    const yesVotes = proposal.votes.filter((v) => v.support).length;
    const noVotes = proposal.votes.filter((v) => !v.support).length;
    const requiredQuorum = Math.ceil(totalMembers * (quorumThreshold / 100));
    const executionLinks = formatExecutionLinksBlockHtml(notice);

    if (proposal.telegramMessageId) {
        const text = formatProposalMessage(proposal, proposal.proposer, {
            yesVotes,
            noVotes,
            requiredQuorum,
            totalEligible: totalMembers,
            concluded: true,
            conclusionStatus: 'EXECUTED',
            executionLinks,
        });
        await bot.api.editMessageText(notice.chatId, proposal.telegramMessageId, text, {
            parse_mode: 'HTML',
        });
        console.log(`📣 Updated proposal #${notice.proposalId} message in Telegram with explorer links`);
        return;
    }

    await bot.api.sendMessage(notice.chatId, formatExecutionNoticeHtml(notice), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
    });
    console.log(`📣 Posted execution notice for proposal #${notice.proposalId} in Telegram`);
}

async function sendPrivateAddToGroupPrompt(ctx: { reply: (text: string, opts?: object) => Promise<unknown> }) {
    await ctx.reply(PRIVATE_ADD_INSTRUCTIONS, {
        parse_mode: 'HTML',
        reply_markup: createSelectGroupKeyboard(),
    });
}

bot.command('start', async (ctx) => {
    if (!ctx.from) return;

    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await syncGroupAdmins(ctx.chat.id);
        await syncGroupTelegramMeta(ctx.api, ctx.chat.id);
        await ctx.reply(GROUP_WELCOME_MESSAGE, { parse_mode: 'HTML' });
        return;
    }

    if (ctx.chat.type === 'private') {
        const userId = ctx.from.id;
        await syncAdminRolesForUserInKnownGroups(userId, async (chatTgId) => {
            try {
                const member = await ctx.api.getChatMember(chatTgId, userId);
                return ['administrator', 'creator'].includes(member.status);
            } catch {
                return false;
            }
        });
        await sendPrivateAddToGroupPrompt(ctx);
    }
});

bot.command('add', async (ctx) => {
    if (!ctx.from || ctx.chat.type !== 'private') return;
    await sendPrivateAddToGroupPrompt(ctx);
});

bot.on('message', async (ctx, next) => {
    const shared = ctx.message?.chat_shared;
    if (!shared || ctx.chat?.type !== 'private' || shared.request_id !== ADD_GROUP_REQUEST_ID) {
        await next();
        return;
    }

    const groupChatId = shared.chat_id;

    try {
        const botMember = await ctx.api.getChatMember(groupChatId, ctx.me.id);
        if (botMember.status === 'left' || botMember.status === 'kicked') {
            await ctx.reply(
                'StonMaker was not added. Tap <b>Select your group</b> again and confirm when Telegram asks to add the bot.',
                { parse_mode: 'HTML', reply_markup: createSelectGroupKeyboard() }
            );
            return;
        }

        const chat = await ctx.api.getChat(groupChatId);
        const title = 'title' in chat ? chat.title : 'your group';

        await ctx.reply(
            `✅ StonMaker is in <b>${title}</b>.\n\nOpen that group and run <code>/join_dao</code> to get started.`,
            { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        );
    } catch (error) {
        console.error('chat_shared handler error:', error);
        await ctx.reply('Could not verify that group. Make sure you are an admin, then try again.', {
            reply_markup: createSelectGroupKeyboard(),
        });
    }
});

bot.on('my_chat_member', async (ctx) => {
    const { new_chat_member, old_chat_member, chat } = ctx.myChatMember;
    if (chat.type !== 'group' && chat.type !== 'supergroup') return;

    const wasOutside = ['left', 'kicked'].includes(old_chat_member.status);
    const nowInside = new_chat_member.status === 'member' || new_chat_member.status === 'administrator';

    if (!wasOutside || !nowInside) return;

    await syncGroupAdmins(chat.id);
    await syncGroupTelegramMeta(ctx.api, chat.id);

    try {
        await bot.api.sendMessage(chat.id, GROUP_WELCOME_MESSAGE, { parse_mode: 'HTML' });
    } catch (error) {
        console.log('Could not post group welcome after bot was added:', error);
    }
});

async function handleProposalFlow(
    chatId: number,
    userId: number,
    username: string | undefined,
    firstName: string | undefined,
    proposalText: string,
    replyFn: (text: string, opts?: object) => Promise<{ message_id: number }>,
    editFn: (messageId: number, text: string, opts?: object) => Promise<unknown>
) {
    const loadingMsg = await replyFn('🧠 <i>Analyzing your proposal...</i>', { parse_mode: 'HTML' });

    const intent = await parseProposalIntent(proposalText);

    if (!intent || intent.action === 'UNKNOWN') {
        await editFn(
            loadingMsg.message_id,
            '❌ I couldn\'t clearly understand the DeFi parameters in your proposal. Please rephrase with specific tokens and amounts.'
        );
        return;
    }

    let expiresAt: Date | undefined;
    if (intent.votingDurationHours && intent.votingDurationHours > 0) {
        expiresAt = new Date(Date.now() + intent.votingDurationHours * 60 * 60 * 1000);
    }

    if (!expiresAt) {
        pendingProposalIntents.set(pendingKey(chatId, userId), {
            rawText: proposalText,
            intent,
            loadingMessageId: loadingMsg.message_id,
            chatId,
        });

        await editFn(
            loadingMsg.message_id,
            '⏳ <b>How long should voting stay open?</b>\n\n<b>Reply to this message</b> with a duration e.g. <code>24h</code>, <code>2d</code>, or <code>1w</code>.',
            { parse_mode: 'HTML' }
        );
        return;
    }

    const dbResult = await createProposal(chatId, userId, proposalText, intent, expiresAt);

    if (!dbResult.success || !dbResult.proposal) {
        await editFn(loadingMsg.message_id, dbResult.message!);
        return;
    }

    const text = formatProposalMessage(dbResult.proposal, dbResult.proposal.proposer, {
        yesVotes: 0,
        noVotes: 0,
        requiredQuorum: dbResult.requiredQuorum!,
        totalEligible: dbResult.totalEligible!,
    });

    const votingKeyboard = new InlineKeyboard()
        .text('👍 Approve (0)', `v_yes_${dbResult.proposal.id}`)
        .text('👎 Reject (0)', `v_no_${dbResult.proposal.id}`);

    await editFn(loadingMsg.message_id, text, { parse_mode: 'HTML', reply_markup: votingKeyboard });
    await saveProposalTelegramMessageId(dbResult.proposal.id, loadingMsg.message_id);
}

bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const chatType = ctx.chat.type;
    const user = ctx.from;
    const chat = ctx.chat;

    if (chatType === 'group' || chatType === 'supergroup') {
        const inviteMatch = text.match(/(https?:\/\/)?t\.me\/\+[A-Za-z0-9_-]+/i);
        if (inviteMatch && (await isGroupAdmin(ctx.api, chat.id, user.id))) {
            const normalized = inviteMatch[0].startsWith('http') ? inviteMatch[0] : `https://${inviteMatch[0]}`;
            await saveGroupInviteLink(chat.id, normalized);
        }

        const pending = pendingProposalIntents.get(pendingKey(chat.id, user.id));
        if (pending && !text.startsWith('/') && !text.toLowerCase().startsWith('propose ')) {
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            if (!isReplyToBot) {
                await ctx.reply(
                    '⏳ Please <b>reply to my duration question</b> with e.g. <code>24h</code>, <code>2d</code>, or <code>1w</code>.',
                    { parse_mode: 'HTML', reply_to_message_id: pending.loadingMessageId }
                );
                return;
            }
            const hours = parseDurationToHours(text);
            if (!hours) {
                await ctx.reply(
                    '❌ Invalid duration. Reply with a duration like <code>24h</code>, <code>2d</code>, or <code>1w</code>.',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
            const dbResult = await createProposal(chat.id, user.id, pending.rawText, pending.intent, expiresAt);
            pendingProposalIntents.delete(pendingKey(chat.id, user.id));

            if (!dbResult.success || !dbResult.proposal) {
                if (pending.loadingMessageId) {
                    await ctx.api.editMessageText(chat.id, pending.loadingMessageId, dbResult.message || '❌ Failed to create proposal.');
                } else {
                    await ctx.reply(dbResult.message || '❌ Failed to create proposal.');
                }
                return;
            }

            const durationLabel = formatDurationFromHours(hours);
            await postProposalMessage(
                chat.id,
                pending.loadingMessageId!,
                dbResult.proposal,
                dbResult.proposal.proposer,
                {
                    yesVotes: 0,
                    noVotes: 0,
                    requiredQuorum: dbResult.requiredQuorum!,
                    totalEligible: dbResult.totalEligible!,
                }
            );
            await saveProposalTelegramMessageId(dbResult.proposal.id, pending.loadingMessageId!);
            await ctx.reply(`⏳ Voting closes in ${durationLabel}.`, { parse_mode: 'HTML' });
            return;
        }

        if (text.startsWith('/help')) {
            await ctx.reply(HELP_MESSAGE, { parse_mode: 'HTML' });
            return;
        }

        if (text.startsWith('/join_dao')) {
            const loadingMsg = await ctx.reply('⏳ Processing your request...');
            const result = await processJoinDaoRequest(user.id, chat.id, user.username, user.first_name, chat.title);
            await syncGroupTelegramMeta(ctx.api, chat.id);
            await ctx.api.editMessageText(chat.id, loadingMsg.message_id, result.message, { parse_mode: 'Markdown' });
            return;
        }

        if (text.startsWith('/treasury')) {
            const treasuryAddress = await getGroupTreasuryAddress(chat.id);

            if (!treasuryAddress) {
                await ctx.reply(
                    '❌ This group hasn\'t been initialized as a DAO yet. Have a member type <code>/join_dao</code> to generate the Treasury.',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            await ctx.reply(
                `🏦 <b>StonMaker Treasury Dashboard</b>\n\n` +
                    `<b>Group:</b> ${chat.title}\n` +
                    `<b>Treasury Address:</b> <code>${treasuryAddress}</code>\n\n` +
                    `<i>This is your counterfactual smart contract wallet. You can securely deposit TON and Jettons directly to this address.</i>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        if (text.startsWith('/balance')) {
            const treasury = await getTreasuryBalance(chat.id);

            if (!treasury) {
                await ctx.reply(
                    '❌ This group hasn\'t been initialized as a DAO yet. Have a member type <code>/join_dao</code> to generate the Treasury.',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            if (treasury.balanceTon < 0) {
                await ctx.reply(
                    `⚠️ Could not fetch balance right now.\n\n<b>Treasury Address:</b> <code>${treasury.address}</code>`,
                    { parse_mode: 'HTML' }
                );
                return;
            }

            if (treasury.balanceTon === 0) {
                await ctx.reply(
                    `🏦 Treasury not yet deployed — address is <code>${treasury.address}</code>. Send TON to activate it.`,
                    { parse_mode: 'HTML' }
                );
                return;
            }

            await ctx.reply(`🏦 <b>Treasury Balance:</b> ${treasury.balanceTon.toFixed(4)} TON`, { parse_mode: 'HTML' });
            return;
        }

        if (text.startsWith('/dashboard')) {
            await ctx.reply(
                `📊 <b>Dashboard lookup</b>\n\n` +
                    `<b>Group:</b> ${chat.title}\n` +
                    `<b>Chat ID:</b> <code>${chat.id}</code>\n\n` +
                    `On the web dashboard, search using:\n` +
                    `• This chat ID\n` +
                    `• Group name: <code>${chat.title}</code>\n` +
                    `• Invite link — admins run <code>/set_invite https://t.me/+...</code> once`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        if (text.startsWith('/set_invite')) {
            if (!(await isGroupAdmin(ctx.api, chat.id, user.id))) {
                await ctx.reply('Only group admins can register the invite link.');
                return;
            }

            const linkArg = text.replace(/^\/set_invite(@\S+)?\s*/i, '').trim();
            const linkMatch = linkArg.match(/(?:https?:\/\/)?t\.me\/\+[A-Za-z0-9_-]+/i);
            if (!linkMatch) {
                await ctx.reply(
                    'Usage: <code>/set_invite https://t.me/+YourInviteHash</code>',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            const normalized = linkMatch[0].startsWith('http') ? linkMatch[0] : `https://${linkMatch[0]}`;
            await saveGroupInviteLink(chat.id, normalized);
            await ctx.reply('✅ Invite link saved. You can now paste it into the web dashboard search.', {
                parse_mode: 'HTML',
            });
            return;
        }

        if (text.startsWith('/propose')) {
            const details = text.replace(/^\/propose(@\S+)?\s*/i, '').trim();
            if (!details) {
                await ctx.reply(
                    'Usage: <code>/propose SWAP 10 TON for USDT voting 24h</code>\n\n<i>You must be an approved DAO member to create proposals.</i>',
                    { parse_mode: 'HTML' }
                );
                return;
            }

            await handleProposalFlow(
                chat.id,
                user.id,
                user.username,
                user.first_name,
                `propose ${details}`,
                (t, opts) => ctx.reply(t, opts as any),
                (id, t, opts) => ctx.api.editMessageText(chat.id, id, t, opts as any)
            );
            return;
        }

        if (ctx.message.reply_to_message?.from?.id === ctx.me.id) {
            const replyText = ctx.message.reply_to_message.text;

            if (replyText?.includes('reply to this message with your TON Wallet Address')) {
                const walletAddress = text.trim();

                if (walletAddress.length === 48) {
                    await saveUserWallet(user.id, chat.id, walletAddress);

                    const admins = await ctx.api.getChatAdministrators(chat.id);

                    const keyboard = new InlineKeyboard()
                        .text('✅ Approve', `app_${user.id}_${chat.id}`)
                        .text('❌ Reject', `rej_${user.id}_${chat.id}`);

                    const adminMessage =
                        `🔔 <b>New DAO Membership Request</b>\n\n` +
                        `<b>Group:</b> ${chat.title}\n` +
                        `<b>User:</b> @${user.username || user.first_name}\n` +
                        `<b>Wallet:</b> <code>${walletAddress}</code>\n\n` +
                        `Please approve or reject:`;

                    let successfulDMs = 0;

                    for (const admin of admins) {
                        if (admin.user.is_bot) continue;

                        try {
                            await ctx.api.sendMessage(admin.user.id, adminMessage, {
                                parse_mode: 'HTML',
                                reply_markup: keyboard,
                            });
                            successfulDMs++;
                        } catch (error) {
                            console.log(`Failed to DM Admin ${admin.user.id}. They need to /start the bot.`);
                        }
                    }

                    await notifyAdminsOnceInGroup(ctx, successfulDMs);

                    if (successfulDMs > 0) {
                        await ctx.reply(
                            `✅ Wallet <code>${walletAddress}</code> linked. An approval request has been sent to the Admins' DMs!`,
                            { parse_mode: 'HTML' }
                        );
                    } else {
                        await ctx.reply(
                            `⚠️ Wallet linked, but I couldn't DM the Admins.\n\n<b>Admins:</b> You must send a private message to @${ctx.me.username} first so I can send you approval requests!`,
                            { parse_mode: 'HTML' }
                        );
                    }
                } else {
                    await ctx.reply("❌ That doesn't look like a valid TON wallet address. Please try again.");
                }
                return;
            }
        }

        if (text.toLowerCase().startsWith('propose ')) {
            await handleProposalFlow(
                chat.id,
                user.id,
                user.username,
                user.first_name,
                text,
                (t, opts) => ctx.reply(t, opts as any),
                (id, t, opts) => ctx.api.editMessageText(chat.id, id, t, opts as any)
            );
            return;
        }
    }
});

bot.on('message:new_chat_members', async (ctx) => {
    const newMembers = ctx.message.new_chat_members;

    for (const member of newMembers) {
        if (member.is_bot) continue;

        const userName = member.username ? `@${member.username}` : member.first_name;
        const welcomeMessage = `Welcome to the group, ${userName}! 🎉\n\nIf you want to be a part of the DAO, you can use the /join_dao command.`;
        await ctx.reply(welcomeMessage);
    }
});

bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const clickerId = ctx.from.id;

    if (data.startsWith('app_') || data.startsWith('rej_')) {
        const parts = data.split('_');
        const action = parts[0] === 'app' ? 'APPROVE' : 'REJECT';
        const targetTgId = parseInt(parts[1]!, 10);
        const targetGroupId = Number(parts[2]!);

        try {
            const chatMember = await ctx.api.getChatMember(targetGroupId, clickerId);
            if (!['administrator', 'creator'].includes(chatMember.status)) {
                await ctx
                    .answerCallbackQuery({ text: '⛔ You are no longer an Admin of this group!', show_alert: true })
                    .catch((err: any) => console.warn('Could not answer callback (likely expired):', err.message));
                return;
            }
            await syncAdminRole(clickerId, targetGroupId, true);
        } catch (error) {
            await ctx
                .answerCallbackQuery({
                    text: '⛔ Error verifying admin status. The bot might have been removed from the group.',
                    show_alert: true,
                })
                .catch((err: any) => console.warn('Could not answer callback (likely expired):', err.message));
            return;
        }

        const success = await resolveJoinRequest(targetTgId, targetGroupId, action);

        if (success) {
            await ctx
                .answerCallbackQuery({ text: `Request ${action === 'APPROVE' ? 'Approved' : 'Rejected'}!` })
                .catch((err: any) => console.warn('Could not answer callback (likely expired):', err.message));

            let targetMention = `[User](tg://user?id=${targetTgId})`;
            try {
                const member = await ctx.api.getChatMember(targetGroupId, targetTgId);
                targetMention = member.user.username
                    ? `@${member.user.username}`
                    : `[${member.user.first_name}](tg://user?id=${targetTgId})`;
            } catch (error) {
                console.log('Could not fetch user for mention.');
            }

            const statusIcon = action === 'APPROVE' ? '✅' : '❌';
            await ctx.editMessageText(
                `🔔 <b>DAO Membership Resolved</b> ${statusIcon}\n\nThe request for ${targetMention} was <b>${action}D</b> by you.`,
                { parse_mode: 'HTML' }
            );

            try {
                await ctx.api.sendMessage(
                    targetGroupId,
                    `📢 DAO update: A membership request for ${targetMention} was <b>${action}D</b> by an admin.`,
                    { parse_mode: 'HTML', disable_notification: true }
                );
            } catch (error) {
                console.log('Could not send update to group.');
            }
        } else {
            await ctx
                .answerCallbackQuery({ text: '❌ Database error occurred.', show_alert: true })
                .catch((err: any) => console.warn('Could not answer callback (likely expired):', err.message));
        }
    }

    if (data.startsWith('v_yes_') || data.startsWith('v_no_')) {
        const parts = data.split('_');
        const support = parts[1] === 'yes';
        const proposalId = parseInt(parts[2]!, 10);
        const chatId = ctx.chat?.id;

        if (!chatId) return;

        const voteResult = await castVote(ctx.from.id, chatId, proposalId, support);

        if (!voteResult.success) {
            await ctx
                .answerCallbackQuery({ text: voteResult.message!, show_alert: true })
                .catch((err: any) => console.warn('Could not answer callback:', err.message));
            return;
        }

        await ctx
            .answerCallbackQuery({
                text: `✅ Vote recorded: ${support ? 'Approve' : 'Reject'}\n\nCurrent Tally:\n👍 ${voteResult.yesVotes} | 👎 ${voteResult.noVotes}\nQuorum: ${voteResult.totalVotes}/${voteResult.requiredQuorum}`,
                show_alert: true,
            })
            .catch((err: any) => console.warn('Could not answer callback:', err.message));

        const p = voteResult.proposal!;
        const messageId = ctx.callbackQuery.message?.message_id;
        if (!messageId) return;

        if (voteResult.newStatus === 'ACTIVE') {
            await postProposalMessage(
                chatId,
                messageId,
                p,
                p.proposer,
                {
                    yesVotes: voteResult.yesVotes!,
                    noVotes: voteResult.noVotes!,
                    requiredQuorum: voteResult.requiredQuorum!,
                    totalEligible: voteResult.totalEligible!,
                }
            );
        } else {
            await postProposalMessage(
                chatId,
                messageId,
                p,
                p.proposer,
                {
                    yesVotes: voteResult.yesVotes!,
                    noVotes: voteResult.noVotes!,
                    requiredQuorum: voteResult.requiredQuorum!,
                    totalEligible: voteResult.totalEligible!,
                },
                true,
                voteResult.newStatus
            );
        }
        return;
    }
});

bot.catch((err: any) => {
    const ctx = err.ctx;
    console.error(`[Error] Update ${ctx.update.update_id} failed:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error('Error in request:', e.description);
    } else if (e instanceof HttpError) {
        console.error('Could not contact Telegram:', e);
    } else {
        console.error('Unknown error:', e);
    }
});

registerApiRoutes(app, bot);

bot.start({
    onStart: (botInfo: { username?: string; can_join_groups?: boolean }) => {
        console.log(`🚀 StonMaker Bot (@${botInfo.username}) is running!`);
        console.log(`🔗 TON network: ${getTonNetworkLabel()}`);
        if (botInfo.can_join_groups === false) {
            console.error(
                '⚠️ This bot cannot be added to groups. In @BotFather run /setjoingroups and choose Enable.'
            );
        }
        void syncAllKnownGroupsTelegramMeta(bot.api);
        startExecutionWorker(async (notice) => {
            try {
                await notifyProposalExecuted(notice);
            } catch (error) {
                console.error(`Could not post execution notice for proposal #${notice.proposalId}:`, error);
            }
        });
    },
});

app.listen(3000, () => {
    console.log(`🌐 Express server is listening on port 3000`);
});
