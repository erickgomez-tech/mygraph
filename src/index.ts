import "dotenv/config";
import path from "path";
import express from "express";
import { graphRouter } from "./api/routes";
import { agentRouter } from "./api/agentRoutes";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(graphRouter);
app.use(agentRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`SAP B1 knowledge graph API listening on port ${port}`);
});
