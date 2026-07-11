import { Graph, HeaderProperties } from "../types/graph";

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
 * references, duplicate ids, orphaned header nodes, and value ranges.
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

  const ownerCount = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.type === "owns") {
      ownerCount.set(edge.to, (ownerCount.get(edge.to) ?? 0) + 1);
    }
  }

  for (const node of graph.nodes) {
    if (node.type === "BusinessPartner") continue;

    const owners = ownerCount.get(node.id) ?? 0;
    if (owners === 0) {
      errors.push({
        code: "ORPHANED_HEADER",
        message: `${node.type} ${node.id} has no owning BusinessPartner`,
        nodeId: node.id,
      });
    } else if (owners > 1) {
      errors.push({
        code: "MULTIPLE_OWNERS",
        message: `${node.type} ${node.id} is owned by ${owners} BusinessPartners`,
        nodeId: node.id,
      });
    }

    const header = node.properties as unknown as HeaderProperties;
    if (typeof header.total === "number" && header.total < 0) {
      errors.push({
        code: "NEGATIVE_TOTAL",
        message: `${node.type} ${node.id} has negative total (${header.total})`,
        nodeId: node.id,
      });
    }
    if (header.date !== null && header.date !== undefined && !isParseableDate(header.date)) {
      errors.push({
        code: "INVALID_DATE",
        message: `${node.type} ${node.id} has an unparseable date (${String(header.date)})`,
        nodeId: node.id,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
