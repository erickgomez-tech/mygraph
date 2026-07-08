import { Router } from "express";
import { askGraphAgent } from "../agent/graphAgent";

export const agentRouter = Router();

agentRouter.post("/agent/ask", async (req, res) => {
  const { question } = req.body ?? {};

  if (typeof question !== "string" || question.trim() === "") {
    res.status(400).json({ error: "Body must include a non-empty 'question' string" });
    return;
  }

  try {
    const answer = await askGraphAgent(question);
    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
