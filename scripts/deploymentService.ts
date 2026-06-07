import { Address, contractAddress } from '@ton/core';
import { Treasury } from '../build/Treasury/Treasury_Treasury'; 

export async function computeTreasuryAddress(groupId: number): Promise<Address> {
    const owner = Address.parse(process.env.BOT_WALLET_ADDRESS!); // StonMaker's admin wallet
    
    // 1. Get the raw code and data cells
    const init = await Treasury.init(owner, BigInt(groupId));
    
    // 2. Compute the deterministic address using TON core
    return contractAddress(0, init);
}