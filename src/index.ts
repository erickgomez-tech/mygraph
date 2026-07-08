import "dotenv/config";
import express from "express";
import { graphRouter } from "./api/routes";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(graphRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`SAP B1 knowledge graph API listening on port ${port}`);
});
