import Groq from "groq-sdk";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

// Initialize the Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const ProposalIntentSchema = z.object({
    action: z.enum(["SWAP", "STAKE", "TRANSFER", "UNKNOWN"]),
    amount: z.number(),
    tokenIn: z.string(),
    tokenOut: z.string().nullable(),
    platform: z.string().nullable(),
    destination: z.string().nullable(), // <-- NEW
    confidence: z.number(),
    explanation: z.string()
});

// Extract the TypeScript type directly from the schema
type ProposalIntent = z.infer<typeof ProposalIntentSchema>;

// 2. The parser function
export async function parseProposalIntent(userMessage: string): Promise<ProposalIntent | null> {
    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile", // Highly capable and lightning fast
            messages: [
                { 
                    role: "system", 
                    content: `You are StonMaker, an AI DAO assistant. Extract investment proposals into JSON:
{
  "action": "SWAP" | "STAKE" | "TRANSFER" | "UNKNOWN",
  "amount": number (0 if not specified),
  "tokenIn": "string",
  "tokenOut": "string or null",
  "platform": "string or null",
  "destination": "string or null (essential for TRANSFER target wallet)",
  "confidence": number,
  "explanation": "1-sentence summary"
}`
                },
                { 
                    role: "user", 
                    content: userMessage 
                }
            ],
            // This forces Groq to ensure the output is parseable JSON
            response_format: { type: "json_object" }, 
            temperature: 0.1, // Keep randomness low for data extraction
        });
        
        const rawContent = completion.choices[0]?.message?.content;
        
        if (!rawContent) return null;

        // 3. Parse the string into a JS object, then validate it against Zod
        const parsedJson = JSON.parse(rawContent);
        const validatedIntent = ProposalIntentSchema.parse(parsedJson);
        
        return validatedIntent;

    } catch (error) {
        console.error("Groq/Zod Parsing Error:", error);
        return null;
    }
}