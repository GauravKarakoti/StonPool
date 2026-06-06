const assetCache: Map<string, { address: string, decimals: number }> = new Map([
    ['USDT', { address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', decimals: 6 }],
]);

// Keep a flag so we only download the massive list once
let isAssetListLoaded = false;

/**
 * Downloads the entire STON.fi asset registry into local RAM.
 */
async function loadAllAssets() {
    if (isAssetListLoaded) return;
    
    try {
        console.log("📥 Downloading STON.fi master asset list...");
        const response = await fetch("https://api.ston.fi/v1/assets");
        
        if (!response.ok) throw new Error(`STON.fi API returned ${response.status}`);
        
        const data = await response.json();
        const assets = data.asset_list || [];
        
        for (const asset of assets) {
            const symbol = asset.symbol.toUpperCase();
            
            // Only cache tokens that are safe and active
            if (asset.blacklisted === false && asset.deprecated === false) {
                // IMPORTANT: Only set it if we haven't seen it yet!
                // This prevents obscure tokens at the bottom of the list from overwriting official ones.
                if (!assetCache.has(symbol)) {
                    assetCache.set(symbol, {
                        address: asset.contract_address,
                        decimals: asset.decimals
                    });
                }
            }
        }
        
        isAssetListLoaded = true;
        console.log(`✅ Cached ${assets.length} tokens from STON.fi!`);
        
    } catch (error) {
        console.error("Error loading STON.fi master asset list:", error);
    }
}

export async function resolveAsset(ticker: string) {  // <-- Add 'export' here
    const symbol = ticker.toUpperCase();

    // 1. Check local memory first
    if (assetCache.has(symbol)) {
        return assetCache.get(symbol);
    }

    // 2. If it's missing, download the master list and try again
    if (!isAssetListLoaded) {
        await loadAllAssets();
        if (assetCache.has(symbol)) {
            return assetCache.get(symbol);
        }
    }

    return null; // Token completely invalid or blacklisted
}

/**
 * Fetches the live exchange rate and expected output for a swap.
 */
export async function fetchSwapQuote(tokenIn: string, tokenOut: string, amount: number) {
    // Instantly resolve both tokens from the local cache
    const offerAsset = await resolveAsset(tokenIn);
    const askAsset = await resolveAsset(tokenOut);

    if (!offerAsset) return { success: false, message: `⚠️ Could not find a safe STON.fi registry entry for **${tokenIn}**.` };
    if (!askAsset) return { success: false, message: `⚠️ Could not find a safe STON.fi registry entry for **${tokenOut}**.` };

    // Convert human amount to nano-units
    const units = Math.floor(amount * Math.pow(10, offerAsset.decimals)).toString();

    try {
        // STON.fi's simulate endpoint expects these as URL Query Parameters!
        const queryParams = new URLSearchParams({
            offer_address: offerAsset.address,
            ask_address: askAsset.address,
            units: units,
            slippage_tolerance: "0.01"
        });

        const response = await fetch(`https://api.ston.fi/v1/swap/simulate?${queryParams.toString()}`, {
            method: "POST",
            headers: { "Accept": "application/json" } // No JSON body needed
        });

        // If it fails, extract the EXACT error message from the server
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`STON.fi API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        const expectedOutput = Number(data.ask_units) / Math.pow(10, askAsset.decimals);
        const fee = Number(data.fee_units) / Math.pow(10, offerAsset.decimals);

        return {
            success: true,
            expectedOutput: expectedOutput.toFixed(4),
            fee: fee.toFixed(4),
            swapRate: (expectedOutput / amount).toFixed(4)
        };

    } catch (error) {
        // Now we will see exactly what STON.fi is complaining about in the terminal
        console.error("STON.fi Quote Error:", error);
        return { success: false, message: " STON.fi liquidity pool is currently unreachable or lacks liquidity for this pair." };
    }
}