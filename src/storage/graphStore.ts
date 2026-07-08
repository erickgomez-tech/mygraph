import { promises as fs } from "fs";
import path from "path";
import { Graph, GraphNode, bpNodeId } from "../types/graph";

function resolveStorePath(): string {
  return path.resolve(process.cwd(), process.env.GRAPH_STORE_PATH ?? "./data/graph.json");
}

/** Writes via a temp file + rename so a crash mid-write can't corrupt the store. */
export async function saveGraph(graph: Graph, storePath: string = resolveStorePath()): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const tmpPath = `${storePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(graph, null, 2), "utf-8");
  await fs.rename(tmpPath, storePath);
}

export async function loadGraph(storePath: string = resolveStorePath()): Promise<Graph> {
  const raw = await fs.readFile(storePath, "utf-8");
  return JSON.parse(raw) as Graph;
}

export async function graphExists(storePath: string = resolveStorePath()): Promise<boolean> {
  try {
    await fs.access(storePath);
    return true;
  } catch {
    return false;
  }
}

export interface BusinessPartnerSubgraph {
  businessPartner: GraphNode;
  invoices: Array<{ invoice: GraphNode; lines: GraphNode[] }>;
}

export async function getBusinessPartnerSubgraph(
  cardCode: string,
  storePath: string = resolveStorePath()
): Promise<BusinessPartnerSubgraph | null> {
  const graph = await loadGraph(storePath);

  const bpId = bpNodeId(cardCode);
  const businessPartner = graph.nodes.find((n) => n.id === bpId && n.type === "BusinessPartner");
  if (!businessPartner) return null;

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const invoiceIds = graph.edges
    .filter((e) => e.type === "owns" && e.from === bpId)
    .map((e) => e.to);

  const invoices = invoiceIds
    .map((invoiceId) => nodesById.get(invoiceId))
    .filter((n): n is GraphNode => n !== undefined)
    .map((invoice) => {
      const lineIds = graph.edges
        .filter((e) => e.type === "has_line" && e.from === invoice.id)
        .map((e) => e.to);
      const lines = lineIds
        .map((lineId) => nodesById.get(lineId))
        .filter((n): n is GraphNode => n !== undefined);
      return { invoice, lines };
    });

  return { businessPartner, invoices };
}
