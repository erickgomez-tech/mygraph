import { B1Session } from "../config/destinations";
import { ENTITY_CONFIGS, EntityConfig } from "../config/entities";
import { BusinessPartner, HeaderProperties, businessPartnerSchema } from "../types/graph";

interface ODataPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/**
 * Follows @odata.nextLink until the Service Layer stops returning one,
 * collecting every page. Service Layer paginates by default (commonly
 * 20-1000 rows per page depending on tenant config). `initialParams` only
 * applies to the first request -- every subsequent nextLink already comes
 * back with its query string fully composed.
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
  /** Normalized header rows keyed by node type ("Order", "ServiceCall", ...). */
  headers: Map<string, HeaderProperties[]>;
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

/**
 * Header-only extraction for one entity. $select keeps the payload to the
 * dozen fields the graph stores -- critical for Invoices/Orders where the
 * default payload includes DocumentLines (a structural property that cannot
 * be suppressed any other way; $expand is invalid on it and $crossjoin was
 * verified on this tenant to produce wrong invoice/line pairings).
 *
 * If the tenant rejects the $select list (400 -- field renamed/absent on
 * that patch level), retry once without $select: the zod strip schema then
 * discards everything not declared, trading bandwidth for compatibility.
 */
export async function extractEntityHeaders(
  session: B1Session,
  config: EntityConfig
): Promise<HeaderProperties[]> {
  let raw: unknown[];
  try {
    raw = await fetchAllPages<unknown>(session, config.collection, {
      $select: config.select.join(","),
    });
  } catch (err) {
    console.warn(
      `[${config.collection}] $select rejected (${(err as Error).message.slice(0, 200)}); retrying without $select`
    );
    raw = await fetchAllPages<unknown>(session, config.collection);
  }

  const headers: HeaderProperties[] = [];
  let invalid = 0;
  let unlinked = 0;

  for (const item of raw) {
    const parsed = config.schema.safeParse(item);
    if (!parsed.success) {
      invalid += 1;
      if (invalid <= 3) {
        console.warn(`[${config.collection}] row failed schema validation: ${parsed.error.message}`);
      }
      continue;
    }
    const header = config.normalize(parsed.data);
    if (header === null) {
      unlinked += 1; // no owning BP (e.g. account payment, unlinked activity)
      continue;
    }
    headers.push(header);
  }

  if (invalid > 0) {
    console.warn(`[${config.collection}] skipped ${invalid} row(s) that failed schema validation`);
  }
  if (unlinked > 0) {
    console.log(`[${config.collection}] skipped ${unlinked} row(s) with no owning BusinessPartner`);
  }

  return headers;
}

export async function extractAll(session: B1Session): Promise<ExtractedData> {
  // Sequential, not Promise.all: keeps peak memory bounded to one paginated
  // fetch in flight at a time, and avoids hammering the Service Layer with
  // 15 concurrent collection scans.
  const businessPartners = await extractBusinessPartners(session);
  console.log(`[BusinessPartners] extracted ${businessPartners.length}`);

  const headers = new Map<string, HeaderProperties[]>();
  for (const config of ENTITY_CONFIGS) {
    const rows = await extractEntityHeaders(session, config);
    headers.set(config.nodeType, rows);
    console.log(`[${config.collection}] extracted ${rows.length} header(s)`);
  }

  return { businessPartners, headers };
}
