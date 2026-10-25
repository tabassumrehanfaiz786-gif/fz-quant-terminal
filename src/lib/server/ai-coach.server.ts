// Server-only Lovable AI Gateway helper for the trade coach.
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "./run-id.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export async function generateCoachReport(request: Request, system: string, userPrompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI gateway key is not configured");
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(MODEL),
    system,
    messages: [{ role: "user", content: userPrompt }],
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const text = await result.text;
  if (!text.trim()) throw new Error("The AI coach returned an empty report");
  return text;
}
