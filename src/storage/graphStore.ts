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

export interface BusinessPartnerSummary {
  businessPartner: {
    CardCode: string;
    CardName: string | null;
    CardType: string | null;
    Currency: string | null;
    Balance: number | null;
    CreditLimit: number | null;
  };
  invoiceSummary: {
    AR: { count: number; totalDocTotal: number };
    AP: { count: number; totalDocTotal: number };
  };
  recentInvoices: Array<{
    id: string;
    direction: string;
    docNum: number | null;
    docDate: string | null;
    docTotal: number;
    documentStatus: string | null;
  }>;
}

/**
 * A byte-budget-friendly view of a BusinessPartner's invoices for consumers
 * with hard response-size limits (e.g. SAP Joule Studio Actions, which log
 * the full response and reject it past a byte_limit_size_exception once a
 * BP has enough invoices/lines). Drops line-item detail and caps the invoice
 * list to the most recent N by DocDate.
 */
export async function getBusinessPartnerSummary(
  cardCode: string,
  options: { recentCount?: number; storePath?: string } = {}
): Promise<BusinessPartnerSummary | null> {
  const { recentCount = 5, storePath } = options;
  const subgraph = await getBusinessPartnerSubgraph(cardCode, storePath);
  if (!subgraph) return null;

  const bpProps = subgraph.businessPartner.properties as Record<string, unknown>;

  const invoiceSummary = {
    AR: { count: 0, totalDocTotal: 0 },
    AP: { count: 0, totalDocTotal: 0 },
  };

  const allInvoices = subgraph.invoices.map(({ invoice }) => {
    const props = invoice.properties as Record<string, unknown>;
    const direction = String(props.direction) as "AR" | "AP";
    const docTotal = typeof props.DocTotal === "number" ? props.DocTotal : 0;

    if (direction === "AR" || direction === "AP") {
      invoiceSummary[direction].count += 1;
      invoiceSummary[direction].totalDocTotal += docTotal;
    }

    return {
      id: invoice.id,
      direction,
      docNum: (props.DocNum as number | null | undefined) ?? null,
      docDate: (props.DocDate as string | null | undefined) ?? null,
      docTotal,
      documentStatus: (props.DocumentStatus as string | null | undefined) ?? null,
    };
  });

  const recentInvoices = allInvoices
    .slice()
    .sort((a, b) => (b.docDate ?? "").localeCompare(a.docDate ?? ""))
    .slice(0, recentCount);

  return {
    businessPartner: {
      CardCode: bpProps.CardCode as string,
      CardName: (bpProps.CardName as string | null | undefined) ?? null,
      CardType: (bpProps.CardType as string | null | undefined) ?? null,
      Currency: (bpProps.Currency as string | null | undefined) ?? null,
      Balance: (bpProps.Balance as number | null | undefined) ?? null,
      CreditLimit: (bpProps.CreditLimit as number | null | undefined) ?? null,
    },
    invoiceSummary,
    recentInvoices,
  };
}
