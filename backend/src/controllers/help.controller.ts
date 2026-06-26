import type { Request, Response } from "express";

import { answerHelpQuestion } from "../services/help/help-answer";
import { normalizeManualRole } from "../services/help/manual-content";
import type { AskHelpInput } from "../validation/help.schema";

/**
 * POST /help/ask — answer a user-manual question, grounded only on the manual
 * content the caller's role is allowed to see. The role comes from the verified
 * JWT (`req.user.role`), never from the request body.
 */
export async function askHelp(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { question } = req.valid?.body as AskHelpInput;
    const role = normalizeManualRole(req.user.role);
    const { answer, sources } = await answerHelpQuestion(role, question);
    return res.status(200).json({ answer, sources });
  } catch (err) {
    console.error("Unexpected help-controller error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
