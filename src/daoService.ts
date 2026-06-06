import 'dotenv/config'; // 1. Guarantee environment variables load first
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg'; // 2. Import the Pool object directly from pg
import { computeTreasuryAddress } from '../scripts/deploymentService';

const connectionString = process.env.DATABASE_URL as string;

// 3. Initialize the pg Pool with your Neon connection string
const pool = new Pool({ connectionString });

// 4. Pass the Pool directly into PrismaPg (NOT as an object)
const adapter = new PrismaPg(pool);

// 5. Pass the adapter to Prisma Client
const prisma = new PrismaClient({ adapter });

export async function saveUserWallet(userTgId: number, walletAddress: string) {
    try {
        await prisma.user.update({
            where: { telegramId: BigInt(userTgId) },
            data: { tonWallet: walletAddress }
        });
        return true;
    } catch (error) {
        console.error("Error saving wallet:", error);
        return false;
    }
}

export async function resolveJoinRequest(
    targetUserTgId: number,
    chatTgId: number,
    action: 'APPROVE' | 'REJECT'
) {
    try {
        // Fetch the internal IDs
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(targetUserTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) return false;

        // Determine new status and role based on Admin action
        const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        const newRole = action === 'APPROVE' ? 'DAO_MEMBER' : 'GUEST';

        // Update the junction table
        await prisma.groupMember.update({
            where: {
                userId_groupId: { userId: user.id, groupId: group.id }
            },
            data: { joinStatus: newStatus, role: newRole }
        });

        return true;
    } catch (error) {
        console.error("Error resolving join request:", error);
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
                firstName: firstName ?? null 
            },
            create: { 
                telegramId: BigInt(userTgId), 
                username: username ?? null, 
                firstName: firstName ?? null 
            }
        });

        const group = await prisma.group.upsert({
            where: { telegramChatId: BigInt(chatTgId) },
            update: { name: chatName || "Unnamed Group" },
            create: { telegramChatId: BigInt(chatTgId), name: chatName || "Unnamed Group" }
        });

        // ---------------------------------------------------------
        // ADD THIS: Auto-initialize the Treasury on first interaction
        // ---------------------------------------------------------
        await initializeGroupTreasury(group.id);
        // ---------------------------------------------------------

        // 3. Check existing membership status
        const existingMembership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: user.id,
                    groupId: group.id
                }
            }
        });

        if (existingMembership) {
            // Handle cases where the user is already interacting
            switch (existingMembership.joinStatus) {
                case 'APPROVED':
                    return { success: false, message: "You are already a recognized DAO Member in this group!" };
                case 'PENDING':
                    return { success: false, message: "Your request is already pending Admin approval." };
                case 'REJECTED':
                    return { success: false, message: "Your previous request was rejected. Please contact an Admin." };
                default:
                    // If they are just a GUEST with NONE status, upgrade to PENDING
                    break;
            }
        }

        // 4. Create or update membership to PENDING
        await prisma.groupMember.upsert({
            where: {
                userId_groupId: {
                    userId: user.id,
                    groupId: group.id
                }
            },
            update: { joinStatus: 'PENDING' },
            create: {
                userId: user.id,
                groupId: group.id,
                role: 'GUEST',
                joinStatus: 'PENDING'
            }
        });

        return { 
            success: true, 
            message: `👋 @${username || firstName}, your request to join the DAO has been logged!\n\n` +
                     `To complete your profile, please **reply to this message** with your TON Wallet Address.` 
        };

    } catch (error) {
        console.error("Database error during /join_dao:", error);
        return { success: false, message: "An internal error occurred while processing your request." };
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
    }
) {
    try {
        // 1. Fetch internal User and Group records
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) {
            return { success: false, message: "❌ System error: User or Group record missing." };
        }

        // 2. Security Enforcement: Verify the user is an active DAO Member
        const membership = await prisma.groupMember.findUnique({
            where: { userId_groupId: { userId: user.id, groupId: group.id } }
        });

        if (!membership || membership.joinStatus !== 'APPROVED') {
            return { 
                success: false, 
                message: "⛔ Access Denied: Only approved DAO Members can introduce investment proposals." 
            };
        }

        // 3. Persist the proposal to PostgreSQL
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
                status: "ACTIVE"
            }
        });

        return { success: true, proposalId: proposal.id };

    } catch (error) {
        console.error("Error creating proposal:", error);
        return { success: false, message: "❌ Internal database error during proposal creation." };
    }
}

export async function castVote(
    userTgId: number, 
    chatTgId: number, 
    proposalId: number, 
    support: boolean
) {
    try {
        // 1. Authenticate the User and Group
        const user = await prisma.user.findUnique({ where: { telegramId: BigInt(userTgId) } });
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });

        if (!user || !group) return { success: false, message: "❌ System error: Record missing." };

        // 2. Verify Active Membership
        const membership = await prisma.groupMember.findUnique({
            where: { userId_groupId: { userId: user.id, groupId: group.id } }
        });

        if (!membership || membership.joinStatus !== 'APPROVED') {
            return { success: false, message: "⛔ Only approved DAO Members can vote." };
        }

        // 3. Verify Proposal is Active
        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return { success: false, message: "❌ Proposal not found." };
        if (proposal.status !== 'ACTIVE') return { success: false, message: "⏳ Voting has already concluded for this proposal." };

        // 4. Record the Vote (Upsert allows changing votes)
        await prisma.vote.upsert({
            where: {
                proposalId_userId: { proposalId: proposal.id, userId: user.id }
            },
            update: { support },
            create: { proposalId: proposal.id, userId: user.id, support }
        });

        // 5. Calculate Quorum and Tally
        const totalEligible = await prisma.groupMember.count({
            where: { groupId: group.id, joinStatus: 'APPROVED' }
        });

        const yesVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: true } });
        const noVotes = await prisma.vote.count({ where: { proposalId: proposal.id, support: false } });
        
        const totalVotes = yesVotes + noVotes;
        
        // Let's assume a 60% Quorum threshold for now
        const requiredQuorum = Math.ceil(totalEligible * 0.6); 
        const quorumReached = totalVotes >= requiredQuorum;

        let newStatus = proposal.status;

        // 6. Conclude Voting if Quorum is met
        if (quorumReached) {
            newStatus = yesVotes > noVotes ? 'PASSED' : 'REJECTED';
            await prisma.proposal.update({
                where: { id: proposal.id },
                data: { status: newStatus }
            });
        }

        return {
            success: true,
            proposal,
            yesVotes,
            noVotes,
            totalVotes,
            requiredQuorum,
            newStatus
        };

    } catch (error) {
        console.error("Error casting vote:", error);
        return { success: false, message: "❌ Internal database error during voting." };
    }
}

export async function initializeGroupTreasury(groupId: number) {
    const treasuryAddress = await computeTreasuryAddress(groupId);
    
    return await prisma.treasury.upsert({
        where: { groupId: groupId },
        update: {}, // Do nothing if it already exists
        create: {
            groupId: groupId,
            contractAddress: treasuryAddress.toString(),
            quorumThreshold: 60
        }
    });
}

export async function getGroupTreasuryAddress(chatTgId: number) {
    try {
        const group = await prisma.group.findUnique({ where: { telegramChatId: BigInt(chatTgId) } });
        if (!group) return null;

        const treasury = await prisma.treasury.findUnique({ where: { groupId: group.id } });
        return treasury ? treasury.contractAddress : null;
    } catch (error) {
        console.error("Error fetching treasury:", error);
        return null;
    }
}