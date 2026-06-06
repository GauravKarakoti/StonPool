import { Address, beginCell, toNano, Cell } from '@ton/core';
import { DEX, pTON } from '@ston-fi/sdk';
import { TonClient, JettonMaster } from '@ton/ton';
import { resolveAsset } from './stonfiServices';

// The official STON.fi V1 Router Address
const STONFI_V1_ROUTER = DEX.v1.Router.address;
const STONFI_V2_ROUTER = Address.parse(
  "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v"
);

/**
 * Builds the payload cell required to trigger a Jetton-to-Jetton swap on STON.fi.
 */
export function buildStonfiSwapPayload(
    daoWalletAddress: string,
    targetRouterJettonWallet: string,
    amountIn: number,
    decimalsIn: number,
    minAmountOut: number,
    decimalsOut: number
): { bocBase64: string, forwardTon: string } {
    
    const daoAddress = Address.parse(daoWalletAddress);
    const targetWalletAddress = Address.parse(targetRouterJettonWallet);

    // 1. Convert human amounts to blockchain nano-units
    const offerUnits = Math.floor(amountIn * Math.pow(10, decimalsIn));
    const minAskUnits = Math.floor(minAmountOut * Math.pow(10, decimalsOut));

    // 2. Build the DEX-Specific Forward Payload
    // This tells the STON.fi router what to do once it receives the Jettons
    const swapPayload = beginCell()
        .storeUint(0x25938561, 32) // STON.fi V1 swap opcode
        .storeAddress(targetWalletAddress) // The Router's token wallet for the token we WANT
        .storeCoins(minAskUnits) // Slippage protection: Minimum tokens to receive
        .storeAddress(daoAddress) // Receiver Address: Where to send the swapped tokens
        .storeUint(0, 1) // No referral address
        .endCell();

    // 3. Build the Standard Jetton Transfer Payload
    // This moves the tokens from the DAO to the Router and attaches the swap instructions
    const jettonTransferBody = beginCell()
        .storeUint(0xf8a7ea5, 32) // Standard Jetton transfer opcode
        .storeUint(0, 64) // Query ID (0 for default)
        .storeCoins(offerUnits) // Amount of tokens to transfer
        .storeAddress(STONFI_V1_ROUTER) // Destination: STON.fi Router
        .storeAddress(daoAddress) // Response destination (where STON.fi returns excess gas)
        .storeBit(0) // No custom payload
        .storeCoins(toNano('0.2')) // Forward TON amount (pays for the STON.fi router's gas)
        .storeBit(1) // Flag indicating our DEX payload is stored as a reference
        .storeRef(swapPayload) // Attach the DEX swap instructions from Step 2
        .endCell();

    // 4. Return the Base64 representation (ready to be signed and broadcasted)
    return {
        bocBase64: jettonTransferBody.toBoc().toString('base64'),
        forwardTon: '0.265' // Recommended total gas for a Jetton->Jetton swap
    };
}

export function buildStonfiProvideLpPayload(
    daoWalletAddress: string,
    targetRouterJettonWallet: string, // The router's wallet for the token you are sending
    otherTokenWalletAddress: string,  // The router's wallet for the OTHER token in the LP pair
    amountIn: number,
    decimalsIn: number,
    minLpOut: number = 1 // Default to 1 nano-LP to prevent complete slippage loss
): { bocBase64: string, forwardTon: string } {
    
    const daoAddress = Address.parse(daoWalletAddress);
    const targetWallet = Address.parse(targetRouterJettonWallet);
    const otherWallet = Address.parse(otherTokenWalletAddress);

    // 1. Convert human amounts to blockchain nano-units
    const offerUnits = Math.floor(amountIn * Math.pow(10, decimalsIn));

    // 2. Build the provide_lp_body (Inner payload)
    const provideLpBody = beginCell()
        .storeCoins(minLpOut) // min_lp_out: Minimum LP tokens to receive
        .storeAddress(daoAddress) // to_address: Receiver of the minted LP tokens
        .storeUint(0, 1) // both_positive: 0 = false (Allows single-sided buffering until the other token is sent)
        .storeCoins(0) // fwd_amount: Gas for custom payload notification
        .storeBit(0) // custom_payload: (Maybe ^Cell) -> None
        .endCell();

    // 3. Build the DEX payload (Router instructions)
    const dexPayload = beginCell()
        .storeUint(0x37c096df, 32) // STON.fi V2 provide_lp opcode
        .storeAddress(otherWallet) // token_wallet1: Address of the OTHER token in the pool
        .storeAddress(daoAddress) // refund_address: Where to return tokens if LP fails
        .storeAddress(daoAddress) // excesses_address: Where to return excess TON gas
        .storeUint(Math.floor(Date.now() / 1000) + (60 * 60), 64) // tx_deadline: 1 hour from now
        .storeRef(provideLpBody) 
        .endCell();

    // 4. Build the Standard Jetton Transfer Payload
    const jettonTransferBody = beginCell()
        .storeUint(0xf8a7ea5, 32) // Standard Jetton transfer opcode
        .storeUint(0, 64) // Query ID
        .storeCoins(offerUnits) // Amount of tokens to transfer
        .storeAddress(STONFI_V2_ROUTER) // Destination: STON.fi V2 Router
        .storeAddress(daoAddress) // Response destination
        .storeBit(0) // No custom payload
        .storeCoins(toNano('0.25')) // Forward TON amount (LP provision requires slightly more routing gas)
        .storeBit(1) // Flag indicating our DEX payload is stored as a reference
        .storeRef(dexPayload) 
        .endCell();

    return {
        bocBase64: jettonTransferBody.toBoc().toString('base64'),
        forwardTon: '0.3' // Total gas required by the Treasury to trigger this cell
    };
}

/**
 * Builds a payload to Transfer native TON from the Treasury to a user.
 */
export function buildNativeTransferPayload(amount: number): { bocBase64: string, forwardTon: string } {
    // Native transfers don't strictly require a body payload
    const emptyPayload = beginCell().endCell();
    
    return {
        bocBase64: emptyPayload.toBoc().toString('base64'),
        forwardTon: amount.toString() // Send the actual transfer amount
    };
}

export function buildStonfiTonToJettonPayload(
    daoWalletAddress: string,
    targetRouterJettonWallet: string, // The Router's wallet for the token you WANT to buy
    amountIn: number, // Amount of TON to swap
    minAmountOut: number,
    decimalsOut: number
): { bocBase64: string, forwardTon: string } {
    
    const daoAddress = Address.parse(daoWalletAddress);
    const targetWalletAddress = Address.parse(targetRouterJettonWallet);

    // 1. Convert human amounts to blockchain nano-units
    const offerUnits = Math.floor(amountIn * 1e9); // Native TON always has 9 decimals
    const minAskUnits = Math.floor(minAmountOut * Math.pow(10, decimalsOut));

    // 2. Build the DEX-Specific Forward Payload
    // This tells the STON.fi router what to do once it receives the swapped pTON
    const swapPayload = beginCell()
        .storeUint(0x25938561, 32) // STON.fi V1 swap opcode
        .storeAddress(targetWalletAddress) // The Router's token wallet for the token we WANT
        .storeCoins(minAskUnits) // Slippage protection: Minimum tokens to receive
        .storeAddress(daoAddress) // Receiver Address: Where to send the swapped tokens
        .storeUint(0, 1) // No referral address
        .endCell();

    // 3. Build the pTON TON_TRANSFER Payload
    // Sent directly to the STON.fi pTON contract along with the Native TON
    const pTonTransferBody = beginCell()
        .storeUint(0x01f3835d, 32) // pTON TON_TRANSFER (pt_swap) opcode
        .storeUint(0, 64) // Query ID
        .storeCoins(offerUnits) // Amount of TON to swap
        .storeAddress(STONFI_V1_ROUTER) // Destination: STON.fi V1 Router
        .storeAddress(daoAddress) // Refund destination (where pTON returns excess TON)
        // NOTE: No custom_payload bit here! (Unlike standard Jetton transfers)
        .storeCoins(toNano('0.2')) // Forward TON amount (pays for the STON.fi router's gas)
        .storeBit(1) // Flag indicating our DEX payload is stored as a reference
        .storeRef(swapPayload) // Attach the DEX swap instructions from Step 2
        .endCell();

    // 4. Return the Base64 representation
    // CRITICAL: For Native TON swaps, the total forwardTon must equal the swap amount PLUS the gas limit.
    const totalTonToForward = amountIn + 0.265; 

    return {
        bocBase64: pTonTransferBody.toBoc().toString('base64'),
        forwardTon: totalTonToForward.toString() 
    };
}

export async function getDynamicSwapPayload(
    client: TonClient,
    daoWalletAddress: string,
    tokenInTicker: string,
    tokenOutTicker: string,
    amountIn: number
) {
    const offerAsset = await resolveAsset(tokenInTicker);
    const askAsset = await resolveAsset(tokenOutTicker);
    if (!offerAsset || !askAsset) throw new Error("Assets not found in STON.fi registry.");

    const askTokenAddr = Address.parse(askAsset.address);
    const treasuryAddr = Address.parse(daoWalletAddress);

    // ✅ NATIVE TON ROUTE HANDLING
    const isNativeTon = offerAsset.address === "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
    
    if (isNativeTon) {
        // Instantiate the pTON V1 contract from STON.fi SDK to get its mainnet address
        const proxyTon = new pTON.v1();
        const pTonAddress = proxyTon.address;
        
        // We still need the Router's wallet for the token we are asking for
        const askMaster = client.open(JettonMaster.create(askTokenAddr));
        const routerAskWallet = await askMaster.getWalletAddress(STONFI_V1_ROUTER);

        const payload = buildStonfiTonToJettonPayload(
            daoWalletAddress,
            routerAskWallet.toString(),
            amountIn,
            (amountIn * 0.99), // Mock 1% slippage limit (replace with real quote data)
            askAsset.decimals
        );

        return {
            targetAddress: pTonAddress.toString(), // Send Native TON directly to the pTON Contract
            bocBase64: payload.bocBase64,
            forwardTon: payload.forwardTon // This contains Swap Amount + Gas
        };
    }

    // ✅ STANDARD JETTON TO JETTON ROUTE
    const offerTokenAddr = Address.parse(offerAsset.address);
    const offerMaster = client.open(JettonMaster.create(offerTokenAddr));
    const treasuryJettonWallet = await offerMaster.getWalletAddress(treasuryAddr);

    const askMaster = client.open(JettonMaster.create(askTokenAddr));
    const routerAskWallet = await askMaster.getWalletAddress(STONFI_V1_ROUTER);

    // Generate the payload with real on-chain data
    const payload = buildStonfiSwapPayload(
        daoWalletAddress,
        routerAskWallet.toString(),
        amountIn,
        offerAsset.decimals,
        (amountIn * 0.99), // Mock 1% slippage limit (replace with real quote data)
        askAsset.decimals
    );

    return {
        targetAddress: treasuryJettonWallet.toString(), // Send to Treasury's Jetton Wallet
        bocBase64: payload.bocBase64,
        forwardTon: payload.forwardTon
    };
}

export function buildStonfiTonProvideLpPayload(
    daoWalletAddress: string,
    routerPairedWallet: string, // The Router's wallet for the OTHER token in the pair
    amountIn: number
): { bocBase64: string, forwardTon: string } {
    const daoAddress = Address.parse(daoWalletAddress);
    const pairedWalletAddress = Address.parse(routerPairedWallet);
    const offerUnits = Math.floor(amountIn * 1e9);

    // 1. Build the DEX-Specific Provide LP Payload
    // This tells the router what to do with the pTON once it receives it
    const lpPayload = beginCell()
        .storeUint(0x4f5f4313, 32) // STON.fi V2 provide_lp opcode
        .storeAddress(pairedWalletAddress) // The Router's token wallet for the paired token
        .storeCoins(1) // min_lp_out (simplified slippage protection)
        .storeAddress(daoAddress) // Receiver Address: Where to send the LP tokens
        .endCell();

    // 2. Build the pTON TON_TRANSFER Payload
    // Sent directly to the pTON contract along with the Native TON
    const pTonTransferBody = beginCell()
        .storeUint(0x01f3835d, 32) // pTON TON_TRANSFER (pt_swap / pt_transfer) opcode
        .storeUint(0, 64) // Query ID
        .storeCoins(offerUnits) // Amount of Native TON to wrap
        .storeAddress(STONFI_V2_ROUTER) // Destination: STON.fi V2 Router
        .storeAddress(daoAddress) // Refund destination
        .storeCoins(toNano('0.3')) // Forward TON amount (pays for the router's gas)
        .storeBit(1) // Flag indicating our DEX payload is stored as a reference
        .storeRef(lpPayload) // Attach the DEX LP instructions from Step 1
        .endCell();

    // Total forward must cover the TON we are wrapping + the gas fee
    const totalTonToForward = amountIn + 0.35; 

    return {
        bocBase64: pTonTransferBody.toBoc().toString('base64'),
        forwardTon: totalTonToForward.toString() 
    };
}

export async function getDynamicLpPayload(
    client: TonClient,
    daoWalletAddress: string,
    tokenInTicker: string,
    pairedTokenTicker: string,
    amountIn: number
) {
    const offerAsset = await resolveAsset(tokenInTicker);
    const pairedAsset = await resolveAsset(pairedTokenTicker);
    if (!offerAsset || !pairedAsset) throw new Error("Assets not found in STON.fi registry.");

    const NATIVE_TON_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

    if (offerAsset.address === NATIVE_TON_ADDRESS) {
        // Instantiate the pTON V2.1 contract with its Mainnet address
        const proxyTon = new pTON.v2_1("EQBnGWMCf3-FZZq1W4IWcWiGAc3PHuZ0_H-7sad2oY00o83S"); 
        const pTonAddress = proxyTon.address;
        
        // We still need the Router's wallet for the Jetton it's being paired with
        const pairedTokenAddr = Address.parse(pairedAsset.address);
        const pairedMaster = client.open(JettonMaster.create(pairedTokenAddr));
        const routerPairedWallet = await pairedMaster.getWalletAddress(STONFI_V2_ROUTER);

        const payload = buildStonfiTonProvideLpPayload(
            daoWalletAddress,
            routerPairedWallet.toString(),
            amountIn
        );

        return {
            targetAddress: pTonAddress.toString(), // Send Native TON to pTON V2 Contract
            bocBase64: payload.bocBase64,
            forwardTon: payload.forwardTon
        };
    }

    // ✅ ROUTE 2: STANDARD JETTON TO JETTON LP
    const offerTokenAddr = Address.parse(offerAsset.address);
    const pairedTokenAddr = Address.parse(pairedAsset.address);
    const treasuryAddr = Address.parse(daoWalletAddress);

    const offerMaster = client.open(JettonMaster.create(offerTokenAddr));
    const treasuryJettonWallet = await offerMaster.getWalletAddress(treasuryAddr);
    const routerOfferWallet = await offerMaster.getWalletAddress(STONFI_V2_ROUTER);
    
    const pairedMaster = client.open(JettonMaster.create(pairedTokenAddr));
    const routerPairedWallet = await pairedMaster.getWalletAddress(STONFI_V2_ROUTER);

    const payload = buildStonfiProvideLpPayload(
        daoWalletAddress,
        routerOfferWallet.toString(),
        routerPairedWallet.toString(),
        amountIn,
        offerAsset.decimals
    );

    return {
        targetAddress: treasuryJettonWallet.toString(), 
        bocBase64: payload.bocBase64,
        forwardTon: payload.forwardTon
    };
}