import { prisma } from './db';
import { computeTreasuryAddressString } from '../scripts/deploymentService';
import { createTonClient } from './tonNetwork';

export { prisma };

export async function saveUserWallet(userTgId: number, chatTgId: number, walletAddress: string) {
    try {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });
        if (!user || !group) return false;

        await prisma.groupMember.update({
            where: { userId_groupId: { userId: user.id, groupId: group.id } },
            data: { tonWallet: walletAddress },
        });
        return true;
    } catch (error) {
        console.error('Error saving wallet:', error);
        return false;
    }
}

export async function saveProposalTelegramMessageId(proposalId: number, messageId: number) {
    await prisma.proposal.update({
        where: { id: proposalId },
        data: { telegramMessageId: messageId },
    });
}

export async function saveGroupInviteLink(chatTgId: number, inviteLink: string) {
    await prisma.group.updateMany({
        where: { telegramChatId: BigInt(chatTgId) },
        data: { inviteLink: inviteLink.trim() },
    });
}

export async function markAdminNotified(chatTgId: number) {
    try {
        await prisma.group.update({
            where: { telegramChatId: BigInt(chatTgId) },
            data: { adminNotified: true },
        });
    } catch (error) {
        console.error('Error marking admin notified:', error);
    }
}

export async function shouldNotifyAdminsInGroup(chatTgId: number): Promise<boolean> {
    const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });
    return !group?.adminNotified;
}

export async function syncAdminRole(userTgId: number, chatTgId: number, isTelegramAdmin: boolean) {
    try {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });
        if (!user || !group) return;

        await prisma.groupMember.upsert({
            where: { userId_groupId: { userId: user.id, groupId: group.id } },
            update: { role: isTelegramAdmin ? 'ADMIN' : undefined },
            create: {
                userId: user.id,
                groupId: group.id,
                role: isTelegramAdmin ? 'ADMIN' : 'GUEST',
                joinStatus: 'NONE',
            },
        });
    } catch (error) {
        console.error('Error syncing admin role:', error);
    }
}

export async function syncAdminRolesForUserInKnownGroups(
    userTgId: number,
    checkIsAdmin: (chatTgId: number) => Promise<boolean>
) {
    const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(userTgId) },
        include: { memberships: { include: { group: true } } },
    });
    if (!user) return;

    for (const membership of user.memberships) {
        const chatTgId = Number(membership.group.telegramChatId);
        const isAdmin = await checkIsAdmin(chatTgId);
        if (isAdmin) {
            await prisma.groupMember.update({
                where: { id: membership.id },
                data: { role: 'ADMIN' },
            });
        }
    }
}

export async function resolveJoinRequest(
    targetUserTgId: number,
    chatTgId: number,
    action: 'APPROVE' | 'REJECT'
) {
    try {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(targetUserTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) return false;

        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const newRole = action === 'APPROVE' ? 'DAO_MEMBER' : 'GUEST';

        await prisma.groupMember.update({
            where: {
                userId_groupId: { userId: user.id, groupId: group.id },
            },
            data: { joinStatus: newStatus, role: newRole },
        });

        return true;
    } catch (error) {
        console.error('Error resolving join request:', error);
        return false;
    }
}

export async function processJoinDaoRequest(
    userTgId: number,
    chatTgId: number,
    username?: string,
    firstName?: string,
    chatName?: string
) {
    try {
        const user = await prisma.user.upsert({
            where: { telegramId: BigInt(userTgId) },
            update: {
                username: username ?? null,
                firstName: firstName ?? null,
            },
            create: {
                telegramId: BigInt(userTgId),
                username: username ?? null,
                firstName: firstName ?? null,
            },
        });

        const group = await prisma.group.upsert({
            where: { telegramChatId: BigInt(chatTgId) },
            update: { name: chatName || 'Unnamed Group' },
            create: { telegramChatId: BigInt(chatTgId), name: chatName || 'Unnamed Group' },
        });

        await initializeGroupTreasury(group.id);

        const existingMembership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: user.id,
                    groupId: group.id,
                },
            },
        });

        if (existingMembership) {
            switch (existingMembership.joinStatus) {
                case 'APPROVED':
                    return { success: false, message: 'You are already a recognized DAO Member in this group!' };
                case 'PENDING':
                    return { success: false, message: 'Your request is already pending Admin approval.' };
                case 'REJECTED':
                    return { success: false, message: 'Your previous request was rejected. Please contact an Admin.' };
                default:
                    break;
            }
        }

        await prisma.groupMember.upsert({
            where: {
                userId_groupId: {
                    userId: user.id,
                    groupId: group.id,
                },
            },
            update: { joinStatus: 'PENDING' },
            create: {
                userId: user.id,
                groupId: group.id,
                role: 'GUEST',
                joinStatus: 'PENDING',
            },
        });

        return {
            success: true,
            message:
                `👋 @${username || firstName}, your request to join the DAO has been logged!\n\n` +
                `To complete your profile, please **reply to this message** with your TON Wallet Address.`,
        };
    } catch (error) {
        console.error('Database error during /join_dao:', error);
        return { success: false, message: 'An internal error occurred while processing your request.' };
    }
}

export async function createProposal(
    chatTgId: number,
    userTgId: number,
    rawText: string,
    intent: {
        action: string;
        amount: number;
        tokenIn: string;
        tokenOut: string | null;
        platform: string | null;
        destination: string | null;
    },
    expiresAt?: Date
) {
    try {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) {
            return { success: false, message: '❌ System error: You aren\'t a member of the DAO.' };
        }

        const membership = await prisma.groupMember.findUnique({
            where: { userId_groupId: { userId: user.id, groupId: group.id } },
        });

        if (!membership || membership.joinStatus !== 'APPROVED') {
            return {
                success: false,
                message: '⛔ Access Denied: Only approved DAO Members can introduce investment proposals.',
            };
        }

        const proposal = await prisma.proposal.create({
            data: {
                groupId: group.id,
                proposerId: user.id,
                text: rawText,
                action: intent.action,
                amount: intent.amount,
                tokenIn: intent.tokenIn,
                tokenOut: intent.tokenOut,
                platform: intent.platform,
                destination: intent.destination,
                status: 'ACTIVE',
                expiresAt: expiresAt ?? null,
            },
            include: {
                proposer: true,
            },
        });

        const totalEligible = await prisma.groupMember.count({
            where: { groupId: group.id, joinStatus: 'APPROVED' },
        });
        const requiredQuorum = Math.ceil(totalEligible * 0.6);

        return {
            success: true,
            proposalId: proposal.id,
            proposal,
            totalEligible,
            requiredQuorum,
            yesVotes: 0,
            noVotes: 0,
        };
    } catch (error) {
        console.error('Error creating proposal:', error);
        return { success: false, message: '❌ Internal database error during proposal creation.' };
    }
}

export async function getProposalVoteContext(proposalId: number, groupId: number) {
    const totalEligible = await prisma.groupMember.count({
        where: { groupId, joinStatus: 'APPROVED' },
    });
    const yesVotes = await prisma.vote.count({ where: { proposalId, support: true } });
    const noVotes = await prisma.vote.count({ where: { proposalId, support: false } });
    const requiredQuorum = Math.ceil(totalEligible * 0.6);
    return { totalEligible, yesVotes, noVotes, requiredQuorum };
}

export async function castVote(userTgId: number, chatTgId: number, proposalId: number, support: boolean) {
    try {
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) return { success: false, message: '❌ System error: You are not a member of the DAO.' };

        const membership = await prisma.groupMember.findUnique({
            where: { userId_groupId: { userId: user.id, groupId: group.id } },
        });

        if (!membership || membership.joinStatus !== 'APPROVED') {
            return { success: false, message: '⛔ Only approved DAO Members can vote.' };
        }

        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            include: { proposer: true },
        });
        if (!proposal) return { success: false, message: '❌ Proposal not found.' };
        if (proposal.status !== 'ACTIVE') {
            return { success: false, message: '⏳ Voting has already concluded for this proposal.' };
        }

        const existingVote = await prisma.vote.findUnique({
            where: {
                proposalId_userId: { proposalId: proposal.id, userId: user.id },
            },
        });

        if (existingVote) {
            return { success: false, message: '⚠️ You have already voted on this proposal.' };
        }

        await prisma.vote.create({
            data: { proposalId: proposal.id, userId: user.id, support },
        });

        const totalEligible = await prisma.groupMember.count({
            where: { groupId: group.id, joinStatus: 'APPROVED' },
        });

        const yesVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: true } });
        const noVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: false } });

        const totalVotes = yesVotes + noVotes;
        const requiredQuorum = Math.ceil(totalEligible * 0.6);
        const quorumReached = totalVotes >= requiredQuorum;

        let newStatus = proposal.status;

        if (quorumReached) {
            newStatus = yesVotes > noVotes ? 'PASSED' : 'REJECTED';
            await prisma.proposal.update({
                where: { id: proposal.id },
                data: { status: newStatus },
            });
        }

        return {
            success: true,
            proposal,
            yesVotes,
            noVotes,
            totalVotes,
            requiredQuorum,
            totalEligible,
            newStatus,
        };
    } catch (error) {
        console.error('Error casting vote:', error);
        return { success: false, message: '❌ Internal database error during voting.' };
    }
}

export async function closeExpiredProposals() {
    const now = new Date();
    const expired = await prisma.proposal.findMany({
        where: {
            status: 'ACTIVE',
            expiresAt: { lte: now },
        },
    });

    for (const proposal of expired) {
        const totalEligible = await prisma.groupMember.count({
            where: { groupId: proposal.groupId, joinStatus: 'APPROVED' },
        });
        const yesVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: true } });
        const noVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: false } });
        const totalVotes = yesVotes + noVotes;
        const requiredQuorum = Math.ceil(totalEligible * 0.6);
        const quorumReached = totalVotes >= requiredQuorum;

        let newStatus: string;
        if (quorumReached && yesVotes > noVotes) {
            newStatus = 'PASSED';
        } else {
            newStatus = 'REJECTED';
        }

        await prisma.proposal.update({
            where: { id: proposal.id },
            data: { status: newStatus },
        });

        console.log(`⏰ Proposal #${proposal.id} auto-closed as ${newStatus} (voting period ended)`);
    }
}

export async function initializeGroupTreasury(groupId: number) {
    const existing = await prisma.treasury.findUnique({ where: { groupId } });
    if (existing?.contractAddress) {
        return existing;
    }

    const treasuryAddress = await computeTreasuryAddressString(groupId);

    return await prisma.treasury.upsert({
        where: { groupId },
        update: {},
        create: {
            groupId,
            contractAddress: treasuryAddress,
            quorumThreshold: 60,
        },
    });
}

export async function getGroupTreasuryAddress(chatTgId: number) {
    try {
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });
        if (!group) return null;

        const treasury = await prisma.treasury.findUnique({ where: { groupId: group.id } });
        if (treasury?.contractAddress) {
            return treasury.contractAddress;
        }

        return (await initializeGroupTreasury(group.id)).contractAddress;
    } catch (error) {
        console.error('Error fetching treasury:', error);
        return null;
    }
}

export async function getTreasuryBalance(chatTgId: number): Promise<{ address: string; balanceTon: number } | null> {
    const address = await getGroupTreasuryAddress(chatTgId);
    if (!address) return null;

    try {
        const { Address } = await import('@ton/core');
        const client = await createTonClient();
        const balance = await client.getBalance(Address.parse(address));
        return { address, balanceTon: Number(balance) / 1e9 };
    } catch (error) {
        console.error('Error fetching treasury balance:', error);
        return { address, balanceTon: -1 };
    }
}
