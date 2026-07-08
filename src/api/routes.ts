import { Router } from "express";
import { getBusinessPartnerSubgraph, graphExists } from "../storage/graphStore";

export const graphRouter = Router();

graphRouter.get("/graph/bp/:cardCode", async (req, res) => {
  const { cardCode } = req.params;

  try {
    if (!(await graphExists())) {
      res.status(503).json({ error: "Graph store has not been populated yet. Run the ingestion pipeline first." });
      return;
    }

    const subgraph = await getBusinessPartnerSubgraph(cardCode);

    if (!subgraph) {
      res.status(404).json({ error: `BusinessPartner '${cardCode}' not found in graph` });
      return;
    }

    res.status(200).json(subgraph);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
