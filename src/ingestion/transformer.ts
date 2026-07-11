import { ExtractedData } from "./extractor";
import {
  EntityNodeType,
  Graph,
  GraphEdge,
  GraphNode,
  bpNodeId,
  entityNodeId,
} from "../types/graph";

/**
 * Header-relation graph: one node per BusinessPartner, one header-only node
 * per related entity (documents, payments, activities, opportunities,
 * service calls), and a single `owns` edge from the BP to each. No line
 * items -- Joule Skills fetch detail from the Service Layer using each
 * node's slCollection/slKeyProperty/key.
 */
export function buildGraph(data: ExtractedData): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const bp of data.businessPartners) {
    nodes.push({ id: bpNodeId(bp.CardCode), type: "BusinessPartner", properties: bp });
  }

  for (const [nodeType, headers] of data.headers) {
    for (const header of headers) {
      const id = entityNodeId(nodeType as EntityNodeType, header.key);
      nodes.push({
        id,
        type: nodeType as EntityNodeType,
        properties: header as unknown as Record<string, unknown>,
      });
      edges.push({
        id: `owns:${header.cardCode}->${id}`,
        type: "owns",
        from: bpNodeId(header.cardCode),
        to: id,
      });
    }
  }

  return {
    nodes,
    edges,
    meta: {
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  };
}
