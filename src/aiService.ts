import Groq from 'groq-sdk';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const ProposalIntentSchema = z.object({
    action: z.enum(['SWAP', 'STAKE', 'TRANSFER', 'UNKNOWN']),
    amount: z.number(),
    tokenIn: z.string(),
    tokenOut: z.string().nullable(),
    platform: z.string().nullable(),
    destination: z.string().nullable(),
    votingDurationHours: z.number().nullable().optional(),
    confidence: z.number(),
    explanation: z.string(),
});

export type ProposalIntent = z.infer<typeof ProposalIntentSchema>;

export async function parseProposalIntent(userMessage: string): Promise<ProposalIntent | null> {
    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are StonMaker, an AI DAO assistant. Extract investment proposals into JSON:
{
  "action": "SWAP" | "STAKE" | "TRANSFER" | "UNKNOWN",
  "amount": number (0 if not specified),
  "tokenIn": "string",
  "tokenOut": "string or null",
  "platform": "string or null",
  "destination": "string or null (essential for TRANSFER target wallet)",
  "votingDurationHours": number or null (optional — parse from phrases like "voting 24h", "voting 3d", "voting 1w"; convert to hours: 1d=24, 1w=168),
  "confidence": number,
  "explanation": "1-sentence summary"
}

Action mapping:
- SWAP = token swap on STON.fi
- STAKE = add liquidity / provide LP on STON.fi (user may say "LP", "liquidity", "add liquidity")
- TRANSFER = send native TON or tokens to a wallet address`,
                },
                {
                    role: 'user',
                    content: userMessage,
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
        });

        const rawContent = completion.choices[0]?.message?.content;
        if (!rawContent) return null;

        const parsedJson = JSON.parse(rawContent);
        const validatedIntent = ProposalIntentSchema.parse(parsedJson);
        return validatedIntent;
    } catch (error) {
        console.error('Groq/Zod Parsing Error:', error);
        return null;
    }
}

/** User-facing label for proposal actions (STAKE stored in DB as STAKE) */
export function getActionUserLabel(action: string): string {
    switch (action) {
        case 'SWAP':
            return 'Swap';
        case 'STAKE':
            return 'Add Liquidity';
        case 'TRANSFER':
            return 'Transfer';
        default:
            return action;
    }
}
