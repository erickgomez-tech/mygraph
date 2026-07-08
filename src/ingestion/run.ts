import "dotenv/config";
import { B1Session } from "../config/destinations";
import { extractAll } from "./extractor";
import { buildGraph } from "./transformer";
import { validateGraph } from "./validator";
import { saveGraph } from "../storage/graphStore";

export async function runIngestion(): Promise<void> {
  const session = new B1Session();

  console.log("Extracting BusinessPartners and Invoices from SAP B1 Service Layer...");
  const data = await extractAll(session);
  console.log(
    `Extracted ${data.businessPartners.length} BusinessPartners, ${data.arInvoices.length} AR Invoices, ${data.apInvoices.length} AP Invoices`
  );

  const graph = buildGraph(data);
  console.log(`Built graph with ${graph.meta.nodeCount} nodes and ${graph.meta.edgeCount} edges`);

  const validation = validateGraph(graph);
  if (!validation.valid) {
    console.warn(`Graph validation found ${validation.errors.length} issue(s):`);
    for (const error of validation.errors) {
      console.warn(`  [${error.code}] ${error.message}`);
    }
  } else {
    console.log("Graph validation passed with no issues");
  }

  await saveGraph(graph);
  console.log("Graph saved");

  await session.logout();
  process.exitCode = validation.valid ? 0 : 1;
}

if (require.main === module) {
  runIngestion().catch((err) => {
    console.error("Ingestion failed:", err);
    process.exitCode = 1;
  });
}
