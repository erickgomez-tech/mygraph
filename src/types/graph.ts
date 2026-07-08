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
    Balance: z.number().nullable().optional(),
    CreditLimit: z.number().nullable().optional(),
  })
  .passthrough();

export type BusinessPartner = z.infer<typeof businessPartnerSchema>;

export const invoiceLineSchema = z
  .object({
    LineNum: z.number().int(),
    ItemCode: z.string().nullable().optional(),
    ItemDescription: z.string().nullable().optional(),
    Quantity: z.number().nullable().optional(),
    Price: z.number().nullable().optional(),
    LineTotal: z.number().nullable().optional(),
    WarehouseCode: z.string().nullable().optional(),
    AccountCode: z.string().nullable().optional(),
  })
  .passthrough();

export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** Shared shape for AR Invoices and AP Invoices (PurchaseInvoices) entities. */
export const invoiceSchema = z
  .object({
    DocEntry: z.number().int(),
    DocNum: z.number().int().nullable().optional(),
    CardCode: z.string().min(1),
    CardName: z.string().nullable().optional(),
    DocDate: z.string().nullable().optional(),
    DocDueDate: z.string().nullable().optional(),
    DocTotal: z.number(),
    DocCurrency: z.string().nullable().optional(),
    DocumentStatus: z.string().nullable().optional(),
    DocumentLines: z.array(invoiceLineSchema).default([]),
  })
  .passthrough();

export type Invoice = z.infer<typeof invoiceSchema>;

export type InvoiceDirection = "AR" | "AP";

export type GraphNodeType = "BusinessPartner" | "Invoice" | "InvoiceLine";
export type GraphEdgeType = "owns" | "has_line";

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

export const invoiceNodeId = (direction: InvoiceDirection, docEntry: number): string =>
  `Invoice:${direction}:${docEntry}`;

export const invoiceLineNodeId = (invoiceId: string, lineNum: number): string =>
  `${invoiceId}:Line:${lineNum}`;
