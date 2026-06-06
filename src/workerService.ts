import { TonClient, WalletContractV4, toNano, Address, Cell } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import { PrismaClient } from '@prisma/client';
import { buildNativeTransferPayload, getDynamicLpPayload, getDynamicSwapPayload } from './executionService';
// Import your compiled Tact wrapper
import { Treasury } from '../build/Treasury/Treasury_Treasury';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL as string;

// 3. Initialize the pg Pool with your Neon connection string
const pool = new Pool({ connectionString });

// 4. Pass the Pool directly into PrismaPg (NOT as an object)
const adapter = new PrismaPg(pool);

// 5. Pass the adapter to Prisma Client
const prisma = new PrismaClient({ adapter });

export async function startExecutionWorker() {
    console.log("⚙️ Starting StonPool Execution Worker...");

    // 1. Keep Keypair derivation OUTSIDE the loop (it doesn't need network)
    const mnemonic = process.env.BOT_MNEMONIC!.split(" ");
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    
    // 2. The Polling Loop (Runs every 15 seconds)
    setInterval(async () => {
        try {
            // Fetch all proposals that hit quorum but haven't been executed
            const pendingProposals = await prisma.proposal.findMany({
                where: { status: 'PASSED' }
            });

            // 🌟 ADD THIS: If there's nothing to do, just skip and don't hit the network
            if (pendingProposals.length === 0) return; 

            // 🌟 MOVE TON CLIENT SETUP HERE: 
            // This guarantees we get a fresh, synced node from Orbs right before execution
            const endpoint = await getHttpEndpoint();
            const client = new TonClient({ endpoint });
            
            const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
            const walletContract = client.open(wallet);
            const sender = walletContract.sender(keyPair.secretKey);

            for (const p of pendingProposals) {
                console.log(`🚀 Executing Proposal #${p.id}...`);

                try {
                    // A. Lock the proposal immediately
                    await prisma.proposal.update({
                        where: { id: p.id },
                        data: { status: 'EXECUTING' }
                    });

                    // B. Fetch the DAO's unique Treasury Address
                    const treasuryRecord = await prisma.treasury.findUnique({
                        where: { groupId: p.groupId }
                    });
                    
                    if (!treasuryRecord || !treasuryRecord.contractAddress) {
                        throw new Error("Treasury not found for group");
                    }
                    
                    const treasuryAddressStr = treasuryRecord.contractAddress;
                    const treasuryAddress = Address.parse(treasuryAddressStr);

                    const treasury = client.open(Treasury.fromAddress(treasuryAddress));

                    let targetAddressStr = "";
                    let finalBocBase64 = "";
                    let finalValueTon = "";

                    switch (p.action) {
                        case 'SWAP':
                            const swapData = await getDynamicSwapPayload(
                                client,
                                treasuryAddressStr,
                                p.tokenIn,
                                p.tokenOut!,
                                p.amount
                            );
                            targetAddressStr = swapData.targetAddress;
                            finalBocBase64 = swapData.bocBase64;
                            finalValueTon = swapData.forwardTon;
                            break;

                        case 'STAKE': // Repurposed as 'PROVIDE LIQUIDITY'
                            const pairedToken = p.tokenOut || "USDT"; // Default pairing if unspecified
                            const lpData = await getDynamicLpPayload(
                                client,
                                treasuryAddressStr,
                                p.tokenIn,
                                pairedToken,
                                p.amount
                            );
                            targetAddressStr = lpData.targetAddress;
                            finalBocBase64 = lpData.bocBase64;
                            finalValueTon = lpData.forwardTon;
                            break;

                        case 'TRANSFER':
                            if (!p.destination) throw new Error("Transfer missing destination address");
                            targetAddressStr = p.destination;
                            const transferPayload = buildNativeTransferPayload(p.amount);
                            finalBocBase64 = transferPayload.bocBase64;
                            finalValueTon = transferPayload.forwardTon; // The full transfer amount
                            break;

                        default:
                            throw new Error(`Unsupported action type: ${p.action}`);
                    }

                    // E. Dispatch to Blockchain
                    await treasury.send(
                        sender,
                        { value: toNano("0.05") }, 
                        {
                            $$type: "ExecuteAction",
                            target: Address.parse(targetAddressStr),
                            value: toNano(finalValueTon),
                            payload: Cell.fromBase64(finalBocBase64),
                            relayerFee: toNano("0.1")
                        }
                    );

                    // F. Mark as successfully completed
                    await prisma.proposal.update({
                        where: { id: p.id },
                        data: { status: 'EXECUTED' }
                    });

                    console.log(`✅ Proposal #${p.id} successfully broadcasted!`);

                } catch (innerError) {
                    console.error(`⚠️ Execution failed for Proposal #${p.id}:`, innerError);
                    
                    // Because we are inside the loop, 'p' is in scope! 
                    // Revert the status so it can be retried on the next cycle
                    await prisma.proposal.update({ 
                        where: { id: p.id }, 
                        data: { status: 'PASSED' } 
                    });
                }
            }
        } catch (outerError) {
            // This catches top-level errors, like Prisma losing connection to Neon
            console.error("Worker Polling Error (Database/Network):", outerError);
        }
    }, 15000); // 15,000 milliseconds
}