import { WalletContractV4, toNano, Address, Cell } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import {
    createTonClient,
    formatExecutionNoticeHtml,
    formatExecutionNoticeLog,
    type ExecutionNotice,
} from './tonNetwork';
import { prisma } from './db';
import { closeExpiredProposals } from './daoService';
import { buildNativeTransferPayload, getDynamicLpPayload, getDynamicSwapPayload } from './executionService';
import { Treasury } from '../build/Treasury/Treasury_Treasury';
import {
    assertTreasuryCanAfford,
    ensureTreasuryDeployed,
    getTreasuryBalanceNano,
} from './treasuryService';

async function fetchLatestRelayerTxHash(
    client: Awaited<ReturnType<typeof createTonClient>>,
    relayerAddress: Address
): Promise<string | null> {
    for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
            const txs = await client.getTransactions(relayerAddress, { limit: 1 });
            const latest = txs[0];
            if (latest) {
                return latest.hash().toString('base64');
            }
        } catch {
            // retry
        }
    }
    return null;
}

export type ExecutionCallback = (notice: ExecutionNotice) => Promise<void>;

export function startExecutionWorker(onExecuted?: ExecutionCallback) {
    console.log('⚙️ Starting StonMaker Execution Worker...');
    console.log(`🔗 TON network: ${process.env.TON_NETWORK || 'testnet (default)'}`);

    const mnemonic = process.env.BOT_MNEMONIC!.split(' ');
    const keyPairPromise = mnemonicToPrivateKey(mnemonic);

    setInterval(async () => {
        try {
            await closeExpiredProposals();

            const pendingProposals = await prisma.proposal.findMany({
                where: { status: 'PASSED' },
            });

            if (pendingProposals.length === 0) return;

            const client = await createTonClient();
            const keyPair = await keyPairPromise;

            const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
            const walletContract = client.open(wallet);
            const sender = walletContract.sender(keyPair.secretKey);

            const configuredOwner = process.env.BOT_WALLET_ADDRESS;
            if (configuredOwner && wallet.address.toString() !== Address.parse(configuredOwner).toString()) {
                console.warn(
                    `⚠️ BOT_MNEMONIC wallet (${wallet.address.toString().slice(0, 10)}…) ` +
                        `does not match BOT_WALLET_ADDRESS (${configuredOwner.slice(0, 10)}…). ` +
                        `ExecuteAction will fail — treasury owner must be the relayer wallet.`
                );
            }

            const relayerBalance = await client.getBalance(wallet.address);
            if (relayerBalance < toNano('0.05')) {
                console.warn(
                    `⚠️ Relayer wallet has no TON on ${process.env.TON_NETWORK || 'testnet'}. ` +
                        `Send testnet TON to ${wallet.address.toString()} for execution gas. ` +
                        `(On-chain balance: ${Number(relayerBalance) / 1e9} TON)`
                );
                return;
            }

            for (const p of pendingProposals) {
                console.log(`🚀 Executing Proposal #${p.id}...`);

                try {
                    await prisma.proposal.update({
                        where: { id: p.id },
                        data: { status: 'EXECUTING' },
                    });

                    const treasuryRecord = await prisma.treasury.findUnique({
                        where: { groupId: p.groupId },
                    });

                    if (!treasuryRecord || !treasuryRecord.contractAddress) {
                        throw new Error('Treasury not found for group');
                    }

                    const group = await prisma.group.findUnique({ where: { id: p.groupId } });
                    if (!group) throw new Error('Group not found for proposal');

                    const treasuryAddressStr = treasuryRecord.contractAddress;
                    const treasuryAddress = Address.parse(treasuryAddressStr);

                    await ensureTreasuryDeployed(client, sender, p.groupId, treasuryAddressStr);

                    const treasuryBalance = await getTreasuryBalanceNano(client, treasuryAddress);
                    assertTreasuryCanAfford(treasuryBalance, p.amount);

                    const treasury = client.open(Treasury.fromAddress(treasuryAddress));

                    let targetAddressStr = '';
                    let finalBocBase64 = '';
                    let finalValueTon = '';

                    switch (p.action) {
                        case 'SWAP': {
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
                        }

                        case 'STAKE': {
                            const pairedToken = p.tokenOut || 'USDT';
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
                        }

                        case 'TRANSFER': {
                            if (!p.destination) throw new Error('Transfer missing destination address');
                            targetAddressStr = p.destination;
                            const transferPayload = buildNativeTransferPayload(p.amount);
                            finalBocBase64 = transferPayload.bocBase64;
                            finalValueTon = transferPayload.forwardTon;
                            break;
                        }

                        default:
                            throw new Error(`Unsupported action type: ${p.action}`);
                    }

                    await treasury.send(
                        sender,
                        { value: toNano('0.05') },
                        {
                            $$type: 'ExecuteAction',
                            target: Address.parse(targetAddressStr),
                            value: toNano(finalValueTon),
                            payload: Cell.fromBase64(finalBocBase64),
                            relayerFee: toNano('0.1'),
                        }
                    );

                    const txHash = await fetchLatestRelayerTxHash(client, wallet.address);

                    await prisma.proposal.update({
                        where: { id: p.id },
                        data: { status: 'EXECUTED', txHash },
                    });

                    const notice: ExecutionNotice = {
                        chatId: Number(group.telegramChatId),
                        proposalId: p.id,
                        action: p.action,
                        amount: p.amount,
                        tokenIn: p.tokenIn,
                        treasuryAddress: treasuryAddressStr,
                        destination: p.destination,
                        txHash,
                    };

                    console.log(formatExecutionNoticeLog(notice));

                    if (onExecuted) {
                        await onExecuted(notice);
                    }
                } catch (innerError) {
                    console.error(`⚠️ Execution failed for Proposal #${p.id}:`, innerError);
                    await prisma.proposal.update({
                        where: { id: p.id },
                        data: { status: 'PASSED' },
                    });
                }
            }
        } catch (outerError) {
            console.error('Worker Polling Error (Database/Network):', outerError);
        }
    }, 15000);
}
