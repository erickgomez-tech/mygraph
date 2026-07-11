import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { getBusinessPartnerSubgraph } from "../storage/graphStore";

const client = new Anthropic();

const getBusinessPartnerGraph = betaZodTool({
  name: "get_business_partner_graph",
  description:
    "Look up a SAP B1 BusinessPartner (customer or supplier) by its CardCode and return its data plus header-level records of every related entity, grouped by type: Activities, SalesOpportunities, ServiceCalls, Quotations, Orders, DeliveryNotes, CreditNotes, Invoices, IncomingPayments, PurchaseQuotations, PurchaseOrders, GoodsReceipts, PurchaseInvoices and VendorPayments. Each record carries its native Service Layer key (slCollection + slKeyProperty + key) plus number, date, status, title and comments -- use those keys to fetch full detail from the Service Layer if needed. Use this whenever the user asks about a specific business partner or anything they own.",
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
