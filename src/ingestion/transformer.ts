import { ExtractedData } from "./extractor";
import {
  Graph,
  GraphEdge,
  GraphNode,
  Invoice,
  InvoiceDirection,
  bpNodeId,
  invoiceLineNodeId,
  invoiceNodeId,
} from "../types/graph";

function invoiceToGraph(
  invoice: Invoice,
  direction: InvoiceDirection
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const invoiceId = invoiceNodeId(direction, invoice.DocEntry);
  const { DocumentLines, ...invoiceProps } = invoice;

  nodes.push({
    id: invoiceId,
    type: "Invoice",
    properties: { ...invoiceProps, direction },
  });

  edges.push({
    id: `owns:${invoice.CardCode}->${invoiceId}`,
    type: "owns",
    from: bpNodeId(invoice.CardCode),
    to: invoiceId,
  });

  for (const line of DocumentLines) {
    const lineId = invoiceLineNodeId(invoiceId, line.LineNum);
    nodes.push({ id: lineId, type: "InvoiceLine", properties: line });
    edges.push({
      id: `has_line:${invoiceId}->${lineId}`,
      type: "has_line",
      from: invoiceId,
      to: lineId,
    });
  }

  return { nodes, edges };
}

export function buildGraph(data: ExtractedData): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const bp of data.businessPartners) {
    nodes.push({ id: bpNodeId(bp.CardCode), type: "BusinessPartner", properties: bp });
  }

  for (const invoice of data.arInvoices) {
    const built = invoiceToGraph(invoice, "AR");
    nodes.push(...built.nodes);
    edges.push(...built.edges);
  }

  for (const invoice of data.apInvoices) {
    const built = invoiceToGraph(invoice, "AP");
    nodes.push(...built.nodes);
    edges.push(...built.edges);
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
