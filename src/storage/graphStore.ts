import { promises as fs } from "fs";
import path from "path";
import { Graph, GraphNode, HeaderProperties, bpNodeId } from "../types/graph";

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
  /** Every header node owned by this BP, grouped by entity type ("Order", "ServiceCall", ...). */
  related: Record<string, GraphNode[]>;
}

/** Full 360° view of a BusinessPartner: the BP node plus every related header node grouped by entity type. */
export async function getBusinessPartnerSubgraph(
  cardCode: string,
  storePath: string = resolveStorePath()
): Promise<BusinessPartnerSubgraph | null> {
  const graph = await loadGraph(storePath);

  const bpId = bpNodeId(cardCode);
  const businessPartner = graph.nodes.find((n) => n.id === bpId && n.type === "BusinessPartner");
  if (!businessPartner) return null;

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const related: Record<string, GraphNode[]> = {};

  for (const edge of graph.edges) {
    if (edge.type !== "owns" || edge.from !== bpId) continue;
    const node = nodesById.get(edge.to);
    if (!node) continue;
    (related[node.type] ??= []).push(node);
  }

  return { businessPartner, related };
}

export interface RelatedEntitySummary {
  entityType: string;
  count: number;
  /** How many are in status "Open". */
  openCount: number;
  /** Sum of totals where the entity carries one (documents, opportunities); null for payments/activities. */
  totalSum: number | null;
}

export interface RecentRelatedHeader {
  entityType: string;
  /** Service Layer collection + key property + key: everything a Joule Skill needs to fetch full detail. */
  slCollection: string;
  slKeyProperty: string;
  key: number;
  number: number | null;
  title: string | null;
  date: string | null;
  status: string | null;
  comments: string | null;
  total: number | null;
}

export interface BusinessPartnerSummary {
  businessPartner: {
    CardCode: string;
    CardName: string | null;
    CardType: string | null;
    Currency: string | null;
    CurrentAccountBalance: number | null;
    CreditLimit: number | null;
  };
  /** One row per entity type that has at least one record for this BP. */
  relatedSummary: RelatedEntitySummary[];
  /** The most recent N records per entity type, flattened and sorted by date descending. */
  recentRelated: RecentRelatedHeader[];
}

/**
 * A byte-budget-friendly 360° view of a BusinessPartner for consumers with
 * hard response-size limits (e.g. SAP Joule Studio Actions, which log the
 * full response and reject it past a byte_limit_size_exception once a BP
 * has enough documents). Aggregates counts/totals per entity type and caps
 * the detail list to the most recent N headers per entity type.
 */
export async function getBusinessPartnerSummary(
  cardCode: string,
  options: { recentPerEntity?: number; storePath?: string } = {}
): Promise<BusinessPartnerSummary | null> {
  const { recentPerEntity = 3, storePath } = options;
  const subgraph = await getBusinessPartnerSubgraph(cardCode, storePath);
  if (!subgraph) return null;

  const bpProps = subgraph.businessPartner.properties as Record<string, unknown>;

  const relatedSummary: RelatedEntitySummary[] = [];
  const recentRelated: RecentRelatedHeader[] = [];

  for (const [entityType, nodes] of Object.entries(subgraph.related)) {
    let openCount = 0;
    let totalSum: number | null = null;

    const headers = nodes.map((node) => node.properties as unknown as HeaderProperties);

    for (const header of headers) {
      if (header.status === "Open") openCount += 1;
      if (typeof header.total === "number") {
        totalSum = (totalSum ?? 0) + header.total;
      }
    }

    relatedSummary.push({ entityType, count: headers.length, openCount, totalSum });

    const recent = headers
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, recentPerEntity)
      .map((header) => ({
        entityType,
        slCollection: header.slCollection,
        slKeyProperty: header.slKeyProperty,
        key: header.key,
        number: header.number,
        title: header.title,
        date: header.date,
        status: header.status,
        comments: header.comments,
        total: header.total,
      }));

    recentRelated.push(...recent);
  }

  relatedSummary.sort((a, b) => a.entityType.localeCompare(b.entityType));
  recentRelated.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return {
    businessPartner: {
      CardCode: bpProps.CardCode as string,
      CardName: (bpProps.CardName as string | null | undefined) ?? null,
      CardType: (bpProps.CardType as string | null | undefined) ?? null,
      Currency: (bpProps.Currency as string | null | undefined) ?? null,
      CurrentAccountBalance: (bpProps.CurrentAccountBalance as number | null | undefined) ?? null,
      CreditLimit: (bpProps.CreditLimit as number | null | undefined) ?? null,
    },
    relatedSummary,
    recentRelated,
  };
}
