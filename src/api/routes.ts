import { Router } from "express";
import {
  getBusinessPartnerSubgraph,
  getBusinessPartnerSummary,
  graphExists,
} from "../storage/graphStore";

export const graphRouter = Router();

graphRouter.get("/graph/bp/:cardCode", async (req, res) => {
  const { cardCode } = req.params;
  // Default to the lean summary shape -- protects size-limited consumers
  // (e.g. SAP Joule Studio Actions) even if they never send the query
  // param at all. Full detail is opt-in via ?summary=false.
  const summary = req.query.summary !== "false";

  try {
    if (!(await graphExists())) {
      res.status(503).json({ error: "Graph store has not been populated yet. Run the ingestion pipeline first." });
      return;
    }

    // Full subgraphs (BP + every invoice + every line) can exceed the
    // response-size limits of consumers like SAP Joule Studio Actions,
    // which log the full response and reject oversized payloads with a
    // byte_limit_size_exception. ?summary=true trades line-item detail
    // for aggregate totals + the most recent invoices.
    const result = summary
      ? await getBusinessPartnerSummary(cardCode)
      : await getBusinessPartnerSubgraph(cardCode);

    if (!result) {
      res.status(404).json({ error: `BusinessPartner '${cardCode}' not found in graph` });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
