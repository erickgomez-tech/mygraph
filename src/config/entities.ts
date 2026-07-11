import { ZodTypeAny } from "zod";
import {
  ActivityHeader,
  DocumentHeader,
  EntityNodeType,
  HeaderProperties,
  OpportunityHeader,
  PaymentHeader,
  ServiceCallHeader,
  activityHeaderSchema,
  documentHeaderSchema,
  opportunityHeaderSchema,
  paymentHeaderSchema,
  serviceCallHeaderSchema,
} from "../types/graph";

/**
 * Comments can be arbitrarily long free text (service call descriptions,
 * activity notes). Truncate so a chatty tenant can't bloat the graph; Joule
 * Skills fetch the full text from the Service Layer when they need it.
 */
const MAX_COMMENT_LENGTH = 500;

function clip(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return trimmed.length > MAX_COMMENT_LENGTH ? `${trimmed.slice(0, MAX_COMMENT_LENGTH)}…` : trimmed;
}

/**
 * Service Layer enum values are prefixed ("bost_Open", "sos_Sold", "tYES").
 * Joule reasons better over plain words, so normalize the common ones and
 * fall back to the raw value for anything tenant-specific.
 */
function documentStatus(doc: DocumentHeader): string | null {
  if (doc.Cancelled === "tYES") return "Cancelled";
  switch (doc.DocumentStatus) {
    case "bost_Open":
      return "Open";
    case "bost_Close":
      return "Closed";
    case "bost_Paid":
      return "Paid";
    case "bost_Delivered":
      return "Delivered";
    default:
      return doc.DocumentStatus ?? null;
  }
}

export interface EntityConfig {
  nodeType: EntityNodeType;
  /** Service Layer collection name, e.g. "Orders". */
  collection: string;
  /** Native key property in the Service Layer, e.g. "DocEntry", "ActivityCode". */
  keyProperty: string;
  /**
   * Fields requested via $select so the Service Layer only ships headers.
   * If a tenant rejects the list (400 -- e.g. a field renamed between patch
   * levels), the extractor retries without $select and the zod strip schema
   * discards the excess instead.
   */
  select: string[];
  schema: ZodTypeAny;
  /** Maps a parsed row to normalized header properties. Return null to skip rows without an owning BP. */
  normalize: (row: unknown) => HeaderProperties | null;
}

function baseHeader(
  config: Pick<EntityConfig, "nodeType" | "collection" | "keyProperty">,
  key: number,
  cardCode: string
): Pick<HeaderProperties, "entityType" | "slCollection" | "slKeyProperty" | "key" | "cardCode"> {
  return {
    entityType: config.nodeType,
    slCollection: config.collection,
    slKeyProperty: config.keyProperty,
    key,
    cardCode,
  };
}

function documentEntity(nodeType: EntityNodeType, collection: string): EntityConfig {
  const meta = { nodeType, collection, keyProperty: "DocEntry" };
  return {
    ...meta,
    select: [
      "DocEntry",
      "DocNum",
      "CardCode",
      "CardName",
      "DocDate",
      "DocDueDate",
      "DocTotal",
      "DocCurrency",
      "DocumentStatus",
      "Cancelled",
      "Comments",
    ],
    schema: documentHeaderSchema,
    normalize: (row) => {
      const doc = row as DocumentHeader;
      return {
        ...baseHeader(meta, doc.DocEntry, doc.CardCode),
        number: doc.DocNum ?? doc.DocEntry,
        title: doc.CardName ?? null,
        date: doc.DocDate ?? null,
        dueDate: doc.DocDueDate ?? null,
        status: documentStatus(doc),
        comments: clip(doc.Comments),
        total: doc.DocTotal ?? null,
        currency: doc.DocCurrency ?? null,
      };
    },
  };
}

function paymentEntity(nodeType: EntityNodeType, collection: string): EntityConfig {
  const meta = { nodeType, collection, keyProperty: "DocEntry" };
  return {
    ...meta,
    select: ["DocEntry", "DocNum", "CardCode", "CardName", "DocDate", "Remarks", "Cancelled"],
    schema: paymentHeaderSchema,
    normalize: (row) => {
      const payment = row as PaymentHeader;
      if (!payment.CardCode) return null; // account-type payment, no BP to hang it on
      return {
        ...baseHeader(meta, payment.DocEntry, payment.CardCode),
        number: payment.DocNum ?? payment.DocEntry,
        title: payment.CardName ?? null,
        date: payment.DocDate ?? null,
        dueDate: null,
        status: payment.Cancelled === "tYES" ? "Cancelled" : "Posted",
        comments: clip(payment.Remarks),
        total: null,
        currency: null,
      };
    },
  };
}

const activityEntity: EntityConfig = (() => {
  const meta = { nodeType: "Activity" as const, collection: "Activities", keyProperty: "ActivityCode" };
  return {
    ...meta,
    select: [
      "ActivityCode",
      "CardCode",
      "ActivityDate",
      "ActivityTime",
      "Activity",
      "ActivityType",
      "Details",
      "Notes",
      "Closed",
    ],
    schema: activityHeaderSchema,
    normalize: (row): HeaderProperties | null => {
      const activity = row as ActivityHeader;
      if (!activity.CardCode) return null; // activity not linked to a BP
      return {
        ...baseHeader(meta, activity.ActivityCode, activity.CardCode),
        number: activity.ActivityCode,
        title: clip(activity.Details),
        date: activity.ActivityDate ?? null,
        dueDate: null,
        status: activity.Closed === "tYES" ? "Closed" : "Open",
        comments: clip(activity.Notes),
        total: null,
        currency: null,
        // cn_Meeting / cn_Conversation / cn_Task etc. -- cheap context for Joule
        activityKind: activity.Activity ?? null,
      };
    },
  };
})();

const opportunityEntity: EntityConfig = (() => {
  const meta = {
    nodeType: "SalesOpportunity" as const,
    collection: "SalesOpportunities",
    keyProperty: "SequentialNo",
  };
  return {
    ...meta,
    select: [
      "SequentialNo",
      "CardCode",
      "OpportunityName",
      "StartDate",
      "ClosingDate",
      "PredictedClosingDate",
      "Status",
      "Remarks",
      "MaxLocalTotal",
    ],
    schema: opportunityHeaderSchema,
    normalize: (row): HeaderProperties | null => {
      const opp = row as OpportunityHeader;
      if (!opp.CardCode) return null;
      const status =
        opp.Status === "sos_Open"
          ? "Open"
          : opp.Status === "sos_Sold"
            ? "Sold"
            : opp.Status === "sos_Missed"
              ? "Missed"
              : (opp.Status ?? null);
      return {
        ...baseHeader(meta, opp.SequentialNo, opp.CardCode),
        number: opp.SequentialNo,
        title: clip(opp.OpportunityName),
        date: opp.StartDate ?? null,
        dueDate: opp.ClosingDate ?? opp.PredictedClosingDate ?? null,
        status,
        comments: clip(opp.Remarks),
        total: opp.MaxLocalTotal ?? null,
        currency: null,
      };
    },
  };
})();

const serviceCallEntity: EntityConfig = (() => {
  const meta = { nodeType: "ServiceCall" as const, collection: "ServiceCalls", keyProperty: "ServiceCallID" };
  return {
    ...meta,
    select: [
      "ServiceCallID",
      "CustomerCode",
      "Subject",
      "CreationDate",
      "ClosingDate",
      "Status",
      "Description",
    ],
    schema: serviceCallHeaderSchema,
    normalize: (row): HeaderProperties | null => {
      const call = row as ServiceCallHeader;
      if (!call.CustomerCode) return null;
      // OSCS statuses are tenant-configurable numeric codes; only -1 ("Closed")
      // is fixed by B1. Expose the raw code otherwise so Skills can resolve it.
      const status = call.Status === -1 ? "Closed" : call.Status !== null && call.Status !== undefined ? `Status:${call.Status}` : null;
      return {
        ...baseHeader(meta, call.ServiceCallID, call.CustomerCode),
        number: call.ServiceCallID,
        title: clip(call.Subject),
        date: call.CreationDate ?? null,
        dueDate: call.ClosingDate ?? null,
        status,
        comments: clip(call.Description),
        total: null,
        currency: null,
      };
    },
  };
})();

/**
 * Every BP-related entity ingested into the graph, header-only.
 * Order matters only for log readability: CRM, then sales cycle, then purchase cycle.
 */
export const ENTITY_CONFIGS: EntityConfig[] = [
  // CRM
  activityEntity,
  opportunityEntity,
  serviceCallEntity,
  // Sales cycle
  documentEntity("Quotation", "Quotations"),
  documentEntity("Order", "Orders"),
  documentEntity("DeliveryNote", "DeliveryNotes"),
  documentEntity("CreditNote", "CreditNotes"),
  documentEntity("Invoice", "Invoices"),
  paymentEntity("IncomingPayment", "IncomingPayments"),
  // Purchase cycle
  documentEntity("PurchaseQuotation", "PurchaseQuotations"),
  documentEntity("PurchaseOrder", "PurchaseOrders"),
  documentEntity("GoodsReceipt", "PurchaseDeliveryNotes"),
  documentEntity("PurchaseInvoice", "PurchaseInvoices"),
  paymentEntity("VendorPayment", "VendorPayments"),
];
