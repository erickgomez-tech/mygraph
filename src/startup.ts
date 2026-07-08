import "dotenv/config";
import { runIngestion } from "./ingestion/run";

/**
 * Cloud Foundry's health check needs $PORT bound quickly or it kills/restarts
 * the container before ingestion (a real SAP B1 pull, tens of seconds) ever
 * finishes -- so the API must come up FIRST and ingestion must run after,
 * in the background, never blocking the listen call.
 *
 * Separately: Cloud Foundry's filesystem is ephemeral -- data/graph.json is
 * wiped on every restart/redeploy. Until the graph has a durable store,
 * re-running ingestion on every boot keeps the API's data fresh after each
 * restart. Until it finishes, routes.ts already serves 503 for a missing
 * graph store, so there's no unhandled gap.
 */
async function start(): Promise<void> {
  await import("./index");

  runIngestion().catch((err) => {
    console.error("Background ingestion failed; API is up but the graph store may be stale or empty:", err);
  });
}

start();
