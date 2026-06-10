import 'dotenv/config';
import { Address, contractAddress } from '@ton/core';
import { Treasury } from '../build/Treasury/Treasury_Treasury';

/** Stable friendly address string (same underlying wallet, one format). */
export function formatTreasuryAddress(address: Address): string {
    const testnet = process.env.TON_NETWORK !== 'mainnet';
    return address.toString({ bounceable: false, testOnly: testnet });
}

export async function computeTreasuryAddress(groupId: number): Promise<Address> {
    const owner = Address.parse(process.env.BOT_WALLET_ADDRESS!);
    const init = await Treasury.init(owner, BigInt(groupId));
    return contractAddress(0, init);
}

export async function computeTreasuryAddressString(groupId: number): Promise<string> {
    return formatTreasuryAddress(await computeTreasuryAddress(groupId));
}