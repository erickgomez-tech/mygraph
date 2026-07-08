import { Graph, Invoice, InvoiceLine } from "../types/graph";

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function isParseableDate(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Graph-level integrity checks. Per-field shape validation already happened
 * against the zod schemas at extraction time (src/types/graph.ts); this pass
 * checks things only visible once the whole graph is assembled: dangling
 * references, duplicate ids, orphaned invoices, and value ranges.
 */
export function validateGraph(graph: Graph): ValidationResult {
  const errors: ValidationError[] = [];
  const nodeIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateIds.add(node.id);
    }
    nodeIds.add(node.id);
  }

  for (const id of duplicateIds) {
    errors.push({ code: "DUPLICATE_NODE_ID", message: `Duplicate node id: ${id}`, nodeId: id });
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        code: "DANGLING_EDGE_FROM",
        message: `Edge ${edge.id} references missing 'from' node ${edge.from}`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        code: "DANGLING_EDGE_TO",
        message: `Edge ${edge.id} references missing 'to' node ${edge.to}`,
        edgeId: edge.id,
      });
    }
  }

  const invoiceOwnerCount = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "owns") {
      invoiceOwnerCount.set(edge.to, (invoiceOwnerCount.get(edge.to) ?? 0) + 1);
    }
  }

  for (const node of graph.nodes) {
    if (node.type !== "Invoice") continue;

    const owners = invoiceOwnerCount.get(node.id) ?? 0;
    if (owners === 0) {
      errors.push({
        code: "ORPHANED_INVOICE",
        message: `Invoice ${node.id} has no owning BusinessPartner`,
        nodeId: node.id,
      });
    } else if (owners > 1) {
      errors.push({
        code: "MULTIPLE_OWNERS",
        message: `Invoice ${node.id} is owned by ${owners} BusinessPartners`,
        nodeId: node.id,
      });
    }

    const invoice = node.properties as Invoice;
    if (typeof invoice.DocTotal === "number" && invoice.DocTotal < 0) {
      errors.push({
        code: "NEGATIVE_DOC_TOTAL",
        message: `Invoice ${node.id} has negative DocTotal (${invoice.DocTotal})`,
        nodeId: node.id,
      });
    }
    if (invoice.DocDate !== undefined && invoice.DocDate !== null && !isParseableDate(invoice.DocDate)) {
      errors.push({
        code: "INVALID_DOC_DATE",
        message: `Invoice ${node.id} has an unparseable DocDate (${String(invoice.DocDate)})`,
        nodeId: node.id,
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.type !== "InvoiceLine") continue;

    const line = node.properties as InvoiceLine;
    if (typeof line.Quantity === "number" && line.Quantity < 0) {
      errors.push({
        code: "NEGATIVE_QUANTITY",
        message: `InvoiceLine ${node.id} has negative Quantity (${line.Quantity})`,
        nodeId: node.id,
      });
    }
    if (typeof line.LineTotal === "number" && line.LineTotal < 0) {
      errors.push({
        code: "NEGATIVE_LINE_TOTAL",
        message: `InvoiceLine ${node.id} has negative LineTotal (${line.LineTotal})`,
        nodeId: node.id,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
