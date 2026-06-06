import "@stdlib/deploy";

// 1. Add the relayerFee parameter
message ExecuteAction {
    target: Address;
    value: Int as coins;
    payload: Cell;
    relayerFee: Int as coins; // <-- NEW: Amount of TON to send back to the bot
}

contract Treasury with Deployable {
    owner: Address;
    groupId: Int;

    init(owner: Address, groupId: Int) {
        self.owner = owner;
        self.groupId = groupId;
    }

    receive(msg: ExecuteAction) {
        require(sender() == self.owner, "Access Denied");

        // 2. THE FEE EXTRACTION: Send the protocol fee back to the bot wallet
        if (msg.relayerFee > 0) {
            send(SendParameters{
                to: self.owner,        // The bot's wallet address
                value: msg.relayerFee, // The fee (e.g., 0.1 TON)
                mode: SendIgnoreErrors // Don't crash the swap if the fee transfer fails
            });
        }

        // 3. THE EXECUTION: Forward the actual DeFi payload to STON.fi
        send(SendParameters{
            to: msg.target,
            value: msg.value,
            mode: SendIgnoreErrors,
            body: msg.payload
        });
    }
}