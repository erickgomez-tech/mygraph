import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { getBusinessPartnerSubgraph } from "../storage/graphStore";

const client = new Anthropic();

const getBusinessPartnerGraph = betaZodTool({
  name: "get_business_partner_graph",
  description:
    "Look up a SAP B1 BusinessPartner (customer or supplier) by its CardCode and return its data plus every AR/AP invoice it owns, including invoice lines (item, quantity, price, account code). Use this whenever the user asks about a specific business partner, their invoices, line items, or account balance.",
  inputSchema: z.object({
    cardCode: z
      .string()
      .describe("The SAP B1 CardCode of the business partner, e.g. 'C20000'"),
  }),
  run: async ({ cardCode }) => {
    const subgraph = await getBusinessPartnerSubgraph(cardCode);
    if (!subgraph) {
      return JSON.stringify({
        error: `No business partner found with CardCode '${cardCode}'`,
      });
    }
    return JSON.stringify(subgraph);
  },
});

export async function askGraphAgent(question: string): Promise<string> {
  const finalMessage = await client.beta.messages.toolRunner({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    tools: [getBusinessPartnerGraph],
    messages: [{ role: "user", content: question }],
  });

  return finalMessage.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
