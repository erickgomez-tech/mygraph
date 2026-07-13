import { z } from "zod";

/**
 * SAP B1 BusinessPartners has ~308 scalar properties whose exact set (especially
 * U_* custom fields) depends on the tenant. We validate the fields we rely on
 * strictly and let the rest pass through untyped rather than hand-declaring
 * all 308 names from memory.
 */
export const businessPartnerSchema = z
  .object({
    CardCode: z.string().min(1),
    CardName: z.string().nullable(),
    CardType: z.enum(["cCustomer", "cSupplier", "cLid"]),
    GroupCode: z.number().int().nullable().optional(),
    Currency: z.string().nullable().optional(),
    Valid: z.enum(["tYES", "tNO"]).nullable().optional(),
    Frozen: z.enum(["tYES", "tNO"]).nullable().optional(),
    CurrentAccountBalance: z.number().nullable().optional(),
    CreditLimit: z.number().nullable().optional(),
  })
  .passthrough();

export type BusinessPartner = z.infer<typeof businessPartnerSchema>;

/**
 * The graph stores every BP-related entity as a HEADER-ONLY node: the native
 * Service Layer key + CardCode + a small normalized set of display fields
 * (date, status, number, comments). Joule Skills use `slCollection` +
 * `slKeyProperty` + `key` to fetch full detail straight from the Service
 * Layer, so the graph itself never needs line items or full payloads.
 *
 * Not every entity is keyed by DocEntry: Activities use ActivityCode,
 * SalesOpportunities use SequentialNo and ServiceCalls use ServiceCallID.
 * `slKeyProperty` records which one applies.
 */
export interface HeaderProperties {
  /** Node type, e.g. "Order", "ServiceCall". Duplicated in the flat properties bag so it is self-describing for LLM consumers. */
  entityType: string;
  /** Service Layer collection to query for full detail, e.g. "Orders". */
  slCollection: string;
  /** Name of the native key property in the Service Layer, e.g. "DocEntry", "ActivityCode". */
  slKeyProperty: string;
  /** Value of the native key. */
  key: number;
  /** Owning BusinessPartner (normalized: ServiceCalls' CustomerCode maps here). */
  cardCode: string;
  /** Human-facing document number (DocNum) where it exists; otherwise the key. */
  number: number | null;
  /** Short human label: OpportunityName, ServiceCall Subject, Activity details, or CardName for documents. */
  title: string | null;
  /** Primary date: DocDate / ActivityDate / StartDate / CreationDate. */
  date: string | null;
  /** Secondary date where meaningful: DocDueDate / ClosingDate. */
  dueDate: string | null;
  /** Normalized status, e.g. "Open", "Closed", "Cancelled", "Sold". */
  status: string | null;
  /** Free-text comments/remarks/notes, truncated to keep the graph small. */
  comments: string | null;
  /** Monetary total where it exists (DocTotal, MaxLocalTotal); null otherwise. */
  total: number | null;
  currency: string | null;
  [extra: string]: unknown;
}

/** Marketing documents (Quotations, Orders, DeliveryNotes, CreditNotes, Invoices, Purchase*). No .passthrough(): zod strips everything not listed, keeping headers lean. */
export const documentHeaderSchema = z.object({
  DocEntry: z.number().int(),
  DocNum: z.number().int().nullable().optional(),
  CardCode: z.string().min(1),
  CardName: z.string().nullable().optional(),
  DocDate: z.string().nullable().optional(),
  DocDueDate: z.string().nullable().optional(),
  DocTotal: z.number().nullable().optional(),
  DocCurrency: z.string().nullable().optional(),
  DocumentStatus: z.string().nullable().optional(),
  Cancelled: z.string().nullable().optional(),
  Comments: z.string().nullable().optional(),
});

export type DocumentHeader = z.infer<typeof documentHeaderSchema>;

/** IncomingPayments / VendorPayments. CardCode is nullable: account-type payments have no BP (skipped at transform time). */
export const paymentHeaderSchema = z.object({
  DocEntry: z.number().int(),
  DocNum: z.number().int().nullable().optional(),
  CardCode: z.string().nullable().optional(),
  CardName: z.string().nullable().optional(),
  DocDate: z.string().nullable().optional(),
  Remarks: z.string().nullable().optional(),
  Cancelled: z.string().nullable().optional(),
});

export type PaymentHeader = z.infer<typeof paymentHeaderSchema>;

/** Activities (OCLG). Keyed by ActivityCode; CardCode is nullable because activities can exist without a linked BP (those are skipped at transform time). */
export const activityHeaderSchema = z.object({
  ActivityCode: z.number().int(),
  CardCode: z.string().nullable().optional(),
  ActivityDate: z.string().nullable().optional(),
  ActivityTime: z.string().nullable().optional(),
  Activity: z.string().nullable().optional(),
  ActivityType: z.number().int().nullable().optional(),
  Details: z.string().nullable().optional(),
  Notes: z.string().nullable().optional(),
  Closed: z.string().nullable().optional(),
});

export type ActivityHeader = z.infer<typeof activityHeaderSchema>;

/** SalesOpportunities (OOPR). Keyed by SequentialNo. */
export const opportunityHeaderSchema = z.object({
  SequentialNo: z.number().int(),
  CardCode: z.string().nullable().optional(),
  OpportunityName: z.string().nullable().optional(),
  StartDate: z.string().nullable().optional(),
  ClosingDate: z.string().nullable().optional(),
  PredictedClosingDate: z.string().nullable().optional(),
  Status: z.string().nullable().optional(),
  Remarks: z.string().nullable().optional(),
  MaxLocalTotal: z.number().nullable().optional(),
});

export type OpportunityHeader = z.infer<typeof opportunityHeaderSchema>;

/** ServiceCalls (OSCL). Keyed by ServiceCallID; the BP lives in CustomerCode, not CardCode. Status is a numeric code from OSCS (tenant-configurable), except -1 which is always "Closed". */
export const serviceCallHeaderSchema = z.object({
  ServiceCallID: z.number().int(),
  CustomerCode: z.string().nullable().optional(),
  Subject: z.string().nullable().optional(),
  CreationDate: z.string().nullable().optional(),
  ClosingDate: z.string().nullable().optional(),
  Status: z.number().int().nullable().optional(),
  Description: z.string().nullable().optional(),
});

export type ServiceCallHeader = z.infer<typeof serviceCallHeaderSchema>;

/** Every non-BP node type in the graph. */
export type EntityNodeType =
  // CRM
  | "Activity"
  | "SalesOpportunity"
  | "ServiceCall"
  // Sales cycle
  | "Quotation"
  | "Order"
  | "DeliveryNote"
  | "CreditNote"
  | "Invoice"
  | "IncomingPayment"
  // Purchase cycle
  | "PurchaseQuotation"
  | "PurchaseOrder"
  | "GoodsReceipt"
  | "PurchaseInvoice"
  | "VendorPayment";

export type GraphNodeType = "BusinessPartner" | EntityNodeType;
export type GraphEdgeType = "owns";

export interface GraphNode<T = Record<string, unknown>> {
  id: string;
  type: GraphNodeType;
  properties: T;
}

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
  };
}

export const bpNodeId = (cardCode: string): string => `BP:${cardCode}`;

export const entityNodeId = (type: EntityNodeType, key: number): string => `${type}:${key}`;
