import { Address, toNano } from '@ton/core';
import { Sender, TonClient } from '@ton/ton';
import { Treasury } from '../build/Treasury/Treasury_Treasury';

export async function getTreasuryContractState(client: TonClient, address: Address) {
    return client.getContractState(address);
}

/** Deploy the Treasury contract if the address only has funds but no active code. */
export async function ensureTreasuryDeployed(
    client: TonClient,
    sender: Sender,
    groupId: number,
    expectedAddressStr: string
): Promise<void> {
    const owner = Address.parse(process.env.BOT_WALLET_ADDRESS!);
    const treasury = client.open(await Treasury.fromInit(owner, BigInt(groupId)));

    const expected = treasury.address.toString({ bounceable: false, testOnly: process.env.TON_NETWORK !== 'mainnet' });
    const stored = Address.parse(expectedAddressStr).toString({ bounceable: false, testOnly: process.env.TON_NETWORK !== 'mainnet' });

    if (expected !== stored) {
        throw new Error(
            `Treasury address mismatch for group ${groupId}. ` +
                `DB has ${expectedAddressStr} but current BOT_WALLET_ADDRESS would produce ${expected}. ` +
                `Do not change BOT_WALLET_ADDRESS after creating a group — restore the original owner wallet.`
        );
    }

    const state = await client.getContractState(treasury.address);
    if (state.state === 'active') return;

    console.log(`📦 Deploying Treasury for group ${groupId} at ${expectedAddressStr.slice(0, 8)}…`);

    await treasury.send(sender, { value: toNano('0.1') }, { $$type: 'Deploy', queryId: 0n });

    // Wait for deployment to propagate on testnet
    for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const next = await client.getContractState(treasury.address);
        if (next.state === 'active') {
            console.log(`✅ Treasury deployed for group ${groupId}`);
            return;
        }
    }

    throw new Error('Treasury deployment sent but contract is not active yet. Retry in a minute.');
}

export async function getTreasuryBalanceNano(client: TonClient, address: Address): Promise<bigint> {
    return client.getBalance(address);
}

export function tonAmountToNano(amountTon: number): bigint {
    // Avoid float artifacts like 1.1500000000000001 that break toNano()
    return BigInt(Math.ceil(amountTon * 1e9));
}

export function assertTreasuryCanAfford(balanceNano: bigint, amountTon: number, relayerFeeTon = 0.1): void {
    const required = tonAmountToNano(amountTon + relayerFeeTon + 0.05);
    if (balanceNano < required) {
        const have = Number(balanceNano) / 1e9;
        throw new Error(
            `Treasury underfunded: has ${have.toFixed(4)} TON but proposal needs ~${(amountTon + relayerFeeTon).toFixed(4)} TON plus gas.`
        );
    }
}
