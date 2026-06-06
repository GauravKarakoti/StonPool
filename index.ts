import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammY";
import * as dotenv from "dotenv";
import { processJoinDaoRequest, saveUserWallet, resolveJoinRequest, createProposal, castVote, getGroupTreasuryAddress } from "./src/daoService";
import { parseProposalIntent } from "./src/aiService";
import { fetchSwapQuote } from "./src/stonfiServices";
import { buildNativeTransferPayload, getDynamicLpPayload, getDynamicSwapPayload } from "./src/executionService";
import { startExecutionWorker } from "./src/workerService";
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { TonClient } from "@ton/ton";

dotenv.config();

const bot = new Bot(process.env.BOT_TOKEN as string);

bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const chatType = ctx.chat.type;
    const user = ctx.from;
    const chat = ctx.chat;

    if (chatType === "group" || chatType === "supergroup") {
        
        if (text.startsWith("/join_dao")) {
            const loadingMsg = await ctx.reply("⏳ Processing your request...");
            const result = await processJoinDaoRequest(user.id, chat.id, user.username, user.first_name, chat.title);
            
            await ctx.api.editMessageText(chat.id, loadingMsg.message_id, result.message, { parse_mode: "Markdown" });
            return;
        }

        // --- TREASURY DASHBOARD COMMAND ---
        if (text.startsWith("/treasury")) {
            const treasuryAddress = await getGroupTreasuryAddress(chat.id);

            if (!treasuryAddress) {
                await ctx.reply("❌ This group hasn't been initialized as a DAO yet. Have a member type `/join_dao` to generate the Treasury.", { parse_mode: "Markdown" });
                return;
            }

            await ctx.reply(
                `🏦 **StonPool Treasury Dashboard**\n\n` +
                `**Group:** ${chat.title}\n` +
                `**Treasury Address:** \`${treasuryAddress}\`\n\n` +
                `_This is your counterfactual smart contract wallet. You can securely deposit TON and Jettons directly to this address._`,
                { parse_mode: "Markdown" }
            );
            return;
        }

        if (ctx.message.reply_to_message?.from?.id === ctx.me.id) {
            const replyText = ctx.message.reply_to_message.text;
            
            if (replyText?.includes("reply to this message with your TON Wallet Address")) {
                const walletAddress = text.trim();
                
                if (walletAddress.length === 48) {
                    // 1. Save wallet to DB
                    await saveUserWallet(user.id, walletAddress);

                    // 2. Fetch all administrators of the current group
                    const admins = await ctx.api.getChatAdministrators(chat.id);
                    
                    // 3. Create a compact payload: app_{userId}_{groupId}
                    // Telegram has a 64-byte limit on callback_data, so we use abbreviations.
                    const keyboard = new InlineKeyboard()
                        .text("✅ Approve", `app_${user.id}_${chat.id}`)
                        .text("❌ Reject", `rej_${user.id}_${chat.id}`);

                    const adminMessage = 
                        `🔔 **New DAO Membership Request**\n\n` +
                        `**Group:** ${chat.title}\n` +
                        `**User:** @${user.username || user.first_name}\n` +
                        `**Wallet:** \`${walletAddress}\`\n\n` +
                        `Please approve or reject:`;

                    let successfulDMs = 0;

                    // 4. Loop through admins and DM them
                    for (const admin of admins) {
                        if (admin.user.is_bot) continue; // Don't DM other bots
                        
                        try {
                            await ctx.api.sendMessage(admin.user.id, adminMessage, {
                                parse_mode: "Markdown",
                                reply_markup: keyboard
                            });
                            successfulDMs++;
                        } catch (error) {
                            // This triggers if the admin hasn't started a chat with the bot yet
                            console.log(`Failed to DM Admin ${admin.user.id}. They need to /start the bot.`);
                        }
                    }

                    // 5. Provide feedback in the group
                    if (successfulDMs > 0) {
                        await ctx.reply(`✅ Wallet \`${walletAddress}\` linked. An approval request has been sent to the Admins' DMs!`, { parse_mode: "Markdown" });
                    } else {
                        await ctx.reply(`⚠️ Wallet linked, but I couldn't DM the Admins. \n\n**Admins:** You must send a private message to @${ctx.me.username} first so I can send you approval requests!`, { parse_mode: "Markdown" });
                    }

                } else {
                    await ctx.reply("❌ That doesn't look like a valid TON wallet address. Please try again.");
                }
                return;
            }
        }

        if (text.toLowerCase().startsWith("propose ")) {
            
            const loadingMsg = await ctx.reply("🧠 *Analyzing your proposal...*", { parse_mode: "Markdown" });
            
            // 1. Parse text using Groq
            const intent = await parseProposalIntent(text);
            
            if (!intent || intent.action === "UNKNOWN") {
                await ctx.api.editMessageText(chat.id, loadingMsg.message_id, "❌ I couldn't clearly understand the DeFi parameters in your proposal. Please rephrase with specific tokens and amounts.");
                return;
            }
            
            const dbResult = await createProposal(chat.id, user.id, text, intent);

            if (!dbResult.success) {
                await ctx.api.editMessageText(chat.id, loadingMsg.message_id, dbResult.message!);
                return;
            }

            let dexQuoteText = "";
            const STONPOOL_FEE_TON = 0.1; // Your protocol & gas coverage fee

            if (intent.action === "SWAP" && intent.tokenOut) {
                const quote = await fetchSwapQuote(intent.tokenIn, intent.tokenOut, intent.amount);
                
                if (quote.success) {
                    dexQuoteText = 
                        `\n📈 **Live Market Data:**\n` +
                        `• **Expected:** ${quote.expectedOutput} ${intent.tokenOut}\n` +
                        `• **Rate:** 1 ${intent.tokenIn} = ${quote.swapRate} ${intent.tokenOut}\n` +
                        `• **LP Fee:** ${quote.fee} ${intent.tokenIn}\n`;
                } else {
                    dexQuoteText = `\n⚠️ *${quote.message}*\n`;
                }
            }

            // 3. Build the In-Chat Voting Interface
            const votingKeyboard = new InlineKeyboard()
                .text("👍 Approve", `v_yes_${dbResult.proposalId}`)
                .text("👎 Reject", `v_no_${dbResult.proposalId}`);
            
            let actionSpecificDetails = "";
            
            if (intent.action === "SWAP") {
                actionSpecificDetails = (intent.tokenOut ? `**Target Asset:** ${intent.tokenOut}\n` : "") + dexQuoteText;
            } else if (intent.action === "STAKE") {
                actionSpecificDetails = `**Protocol:** ${intent.platform || "STON.fi"}\n**Expected Yield:** ~4.5% APY\n`;
            } else if (intent.action === "TRANSFER") {
                actionSpecificDetails = `**Destination:** \`${intent.destination || "Address not provided"}\`\n`;
            }

            const responseText = 
                `📋 **Proposal #${dbResult.proposalId}**\n\n` +
                `**Proposer:** @${user.username || user.first_name}\n` +
                `**Action:** ${intent.action}\n` +
                `**Amount:** ${intent.amount} ${intent.tokenIn}\n` +
                actionSpecificDetails +
                `\n⚙️ **Network Costs:**\n` +
                `• **StonPool Relayer Fee:** ${STONPOOL_FEE_TON} TON\n` + 
                `_(Deducted automatically from Treasury to cover gas and automation)_\n` +
                `\n*AI Summary:* ${intent.explanation}\n\n` +
                `🏁 *Voting is now OPEN. Quorum required: 60%*`;
                                 
            await ctx.api.editMessageText(chat.id, loadingMsg.message_id, responseText, { 
                parse_mode: "Markdown",
                reply_markup: votingKeyboard
            });
            return;
        }
    }
});

bot.on("message:new_chat_members", async (ctx) => {
  const newMembers = ctx.message.new_chat_members;

  for (const member of newMembers) {
    // Optional: Prevent the bot from welcoming other bots
    if (member.is_bot) continue;

    const userName = member.username ? `@${member.username}` : member.first_name;
    
    const welcomeMessage = `Welcome to the group, ${userName}! 🎉\n\nIf you want to be a part of the DAO, you can use the /join_dao command.`;

    // Send the welcome message to the group
    await ctx.reply(welcomeMessage);
  }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const clickerId = ctx.from.id;

    if (data.startsWith("app_") || data.startsWith("rej_")) {
        // Parse the compact payload: app_{userId}_{groupId}
        const parts = data.split('_');
        const action = parts[0] === 'app' ? 'APPROVE' : 'REJECT';
        const targetTgId = parseInt(parts[1]!, 10);
        const targetGroupId = Number(parts[2]!); // Use Number() to safely handle large negative BigInt group IDs

        // 1. Verify the clicker is still an Admin of that specific group
        try {
            const chatMember = await ctx.api.getChatMember(targetGroupId, clickerId);
            if (!['administrator', 'creator'].includes(chatMember.status)) {
                await ctx.answerCallbackQuery({ text: "⛔ You are no longer an Admin of this group!", show_alert: true }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));
                return;
            }
        } catch (error) {
            await ctx.answerCallbackQuery({ text: "⛔ Error verifying admin status. The bot might have been removed from the group.", show_alert: true }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));
            return;
        }

        // 2. Update the Database using the extracted Group ID
        const success = await resolveJoinRequest(targetTgId, targetGroupId, action);

        if (success) {
            await ctx.answerCallbackQuery({ text: `Request ${action === 'APPROVE' ? 'Approved' : 'Rejected'}!` }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));

            // --- FETCH USER FOR MENTION ---
            let targetMention = `[User](tg://user?id=${targetTgId})`; // Fallback
            try {
                const member = await ctx.api.getChatMember(targetGroupId, targetTgId);
                // If they have a username, tag it. Otherwise, create a text link to their profile.
                targetMention = member.user.username 
                    ? `@${member.user.username}` 
                    : `[${member.user.first_name}](tg://user?id=${targetTgId})`;
            } catch (error) {
                console.log("Could not fetch user for mention.");
            }

            // 3. Edit the DM message so the buttons disappear (now using their name!)
            const statusIcon = action === 'APPROVE' ? '✅' : '❌';
            await ctx.editMessageText(
                `🔔 **DAO Membership Resolved** ${statusIcon}\n\n` +
                `The request for ${targetMention} was **${action}D** by you.`,
                { parse_mode: "Markdown" }
            );

            // 4. Send a silent notification back to the main group with the proper tag
            try {
                await ctx.api.sendMessage(
                    targetGroupId, 
                    `📢 DAO update: A membership request for ${targetMention} was **${action}D** by an admin.`,
                    { parse_mode: "Markdown", disable_notification: true }
                );
            } catch (error) {
                console.log("Could not send update to group.");
            }

        } else {
            await ctx.answerCallbackQuery({ text: "❌ Database error occurred.", show_alert: true }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));
        }
    }

    if (data.startsWith("v_yes_") || data.startsWith("v_no_")) {
        const parts = data.split('_');
        const support = parts[1] === 'yes';
        const proposalId = parseInt(parts[2]!, 10);
        const chatId = ctx.chat?.id;

        if (!chatId) return;

        // 1. Send data to PostgreSQL
        const voteResult = await castVote(ctx.from.id, chatId, proposalId, support);

        // 2. Handle unauthorized clicks (Alert popup)
        if (!voteResult.success) {
            await ctx.answerCallbackQuery({ text: voteResult.message!, show_alert: true }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));
            return;
        }

        await ctx.answerCallbackQuery({ 
            text: `✅ Vote recorded: ${support ? 'Approve' : 'Reject'}` 
        }).catch(err => console.warn("Could not answer callback (likely expired):", err.message));

        // 4. Rebuild the Live Dashboard UI
        const p = voteResult.proposal!;
        let responseText = 
            `📋 **Proposal #${p.id}**\n\n` +
            `**Action:** ${p.action}\n` +
            `**Amount:** ${p.amount} ${p.tokenIn}\n` +
            (p.tokenOut ? `**Target Asset:** ${p.tokenOut}\n` : "") +
            (p.platform ? `**Protocol:** ${p.platform}\n` : "") +
            `\n📊 **Live Tally:**\n` +
            `👍 Approve: ${voteResult.yesVotes}\n` +
            `👎 Reject: ${voteResult.noVotes}\n` +
            `_Quorum: ${voteResult.totalVotes} / ${voteResult.requiredQuorum} required_`;

        // 5. Update the message state based on Quorum
        if (voteResult.newStatus === 'ACTIVE') {
            // Still active? Keep the buttons.
            const votingKeyboard = new InlineKeyboard()
                .text("👍 Approve", `v_yes_${p.id}`)
                .text("👎 Reject", `v_no_${p.id}`);
                
            await ctx.editMessageText(responseText, { 
                parse_mode: "Markdown", 
                reply_markup: votingKeyboard 
            });
        } else {
            // Quorum reached!
            const statusIcon = voteResult.newStatus === 'PASSED' ? '✅' : '❌';
            responseText += `\n\n🏁 **Voting Concluded: ${voteResult.newStatus} ${statusIcon}**`;
            
            // Generate a UI preview of the payload for ALL supported actions
            if (voteResult.newStatus === 'PASSED') {
                try {
                    // 1. Initialize RPC client (Defaults to Mainnet)
                    const endpoint = await getHttpEndpoint();
                    const client = new TonClient({ endpoint });

                    // 2. Fetch the DAO's unique Treasury
                    const treasuryAddressStr = await getGroupTreasuryAddress(chatId);
                    if (!treasuryAddressStr) throw new Error("Treasury missing.");

                    // 3. Route to the correct Dynamic Payload Builder for UI transparency
                    let payloadResult;

                    if (p.action === 'SWAP') {
                        payloadResult = await getDynamicSwapPayload(
                            client, treasuryAddressStr, p.tokenIn, p.tokenOut!, p.amount
                        );
                    } 
                    else if (p.action === 'STAKE') {
                        const pairedToken = p.tokenOut || "USDT"; // Default pairing
                        payloadResult = await getDynamicLpPayload(
                            client, treasuryAddressStr, p.tokenIn, pairedToken, p.amount
                        );
                    } 
                    else if (p.action === 'TRANSFER') {
                        payloadResult = buildNativeTransferPayload(p.amount);
                    }

                    // 4. Print the generated cell to the chat
                    if (payloadResult) {
                        responseText += `\n\n⚙️ **Execution Payload Generated:**\n\`${payloadResult.bocBase64}\``;
                        responseText += `\n_Gas Required: ~${payloadResult.forwardTon} TON_`;
                    }

                } catch (err) {
                    console.error("UI Payload preview error:", err);
                    responseText += `\n\n⚠️ *Payload preview generation pending background execution...*`;
                }
            }

            await ctx.editMessageText(responseText, { parse_mode: "Markdown" });
        }
        return;
    }
});

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Error] Update ${ctx.update.update_id} failed:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});

bot.start({
    onStart: (botInfo) => {
        console.log(`🚀 StonPool Bot (@${botInfo.username}) is running!`);
        startExecutionWorker(); // Ignite the background process
    },
});