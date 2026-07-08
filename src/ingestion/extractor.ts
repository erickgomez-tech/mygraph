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
 * `initialParams` only applies to the first request -- every subsequent
 * nextLink already comes back with its query string fully composed.
 */
async function fetchAllPages<T>(
  session: B1Session,
  initialPath: string,
  initialParams?: Record<string, unknown>
): Promise<T[]> {
  const results: T[] = [];
  let path: string | undefined = initialPath;
  let params: Record<string, unknown> | undefined = initialParams;

  while (path) {
    const page: ODataPage<T> = await session.get<ODataPage<T>>(path, params);
    results.push(...page.value);
    path = page["@odata.nextLink"];
    params = undefined;
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
  // is invalid here and the server rejects it with a 400.
  //
  // We tried trimming line payload size via
  // $crossjoin(Invoices,Invoices/DocumentLines)?$expand=...($select=...) to
  // ease memory pressure, but verified against this tenant that $crossjoin
  // does NOT correlate each invoice with its own lines -- it's a true
  // cartesian product (every row we sampled came back paired with DocEntry 1
  // regardless of that invoice's actual line count). Do not use $crossjoin
  // for bulk data reconstruction; it silently produces wrong invoice/line
  // pairings. It remains valid for $filter-only existence checks (e.g. "does
  // any invoice have a line with AccountCode X"), just not for rebuilding
  // DocumentLines arrays.
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
  // Sequential, not Promise.all: keeps peak memory bounded to one large
  // paginated fetch in flight at a time instead of three concurrently.
  const businessPartners = await extractBusinessPartners(session);
  const arInvoices = await extractARInvoices(session);
  const apInvoices = await extractAPInvoices(session);

  return { businessPartners, arInvoices, apInvoices };
}
