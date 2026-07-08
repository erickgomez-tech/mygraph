import { B1Session } from "../config/destinations";
import {
  BusinessPartner,
  Invoice,
  businessPartnerSchema,
  invoiceSchema,
} from "../types/graph";

interface ODataPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/**
 * Follows @odata.nextLink until the Service Layer stops returning one,
 * collecting every page. Service Layer paginates BusinessPartners/Invoices
 * by default (commonly 20-1000 rows per page depending on tenant config).
 */
async function fetchAllPages<T>(session: B1Session, initialPath: string): Promise<T[]> {
  const results: T[] = [];
  let path: string | undefined = initialPath;

  while (path) {
    const page: ODataPage<T> = await session.get<ODataPage<T>>(path);
    results.push(...page.value);
    path = page["@odata.nextLink"];
  }

  return results;
}

export interface ExtractedData {
  businessPartners: BusinessPartner[];
  arInvoices: Invoice[];
  apInvoices: Invoice[];
}

export async function extractBusinessPartners(session: B1Session): Promise<BusinessPartner[]> {
  const raw = await fetchAllPages<unknown>(session, "BusinessPartners");
  return raw.map((item, index) => {
    const parsed = businessPartnerSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(
        `BusinessPartner at index ${index} failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  });
}

export async function extractARInvoices(session: B1Session): Promise<Invoice[]> {
  // DocumentLines is a structural (complex-type collection) property, not a
  // navigation property, so Service Layer returns it by default -- $expand
  // is invalid here and the server rejects it with a 400. If line-level
  // server-side filtering is ever needed (e.g. only invoices touching a
  // given AccountCode), Service Layer does support
  // $crossjoin(Invoices,Invoices/DocumentLines)?$expand=...&$filter=... even
  // though DocumentLines isn't a navigation property; confirmed working
  // against this tenant.
  const raw = await fetchAllPages<unknown>(session, "Invoices");
  return raw.map((item, index) => {
    const parsed = invoiceSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(
        `AR Invoice at index ${index} failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  });
}

export async function extractAPInvoices(session: B1Session): Promise<Invoice[]> {
  const raw = await fetchAllPages<unknown>(session, "PurchaseInvoices");
  return raw.map((item, index) => {
    const parsed = invoiceSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(
        `AP Invoice at index ${index} failed schema validation: ${parsed.error.message}`
      );
    }
    return parsed.data;
  });
}

export async function extractAll(session: B1Session): Promise<ExtractedData> {
  const [businessPartners, arInvoices, apInvoices] = await Promise.all([
    extractBusinessPartners(session),
    extractARInvoices(session),
    extractAPInvoices(session),
  ]);

  return { businessPartners, arInvoices, apInvoices };
}
