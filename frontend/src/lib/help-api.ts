import { api } from "./api";

/** Answer + the manual section titles it was drawn from. */
export interface HelpAnswer {
  answer: string;
  sources: string[];
}

/**
 * POST /help/ask — ask a natural-language question about the user manual. The
 * backend grounds the answer on the caller's role-scoped manual content.
 */
export async function askManual(question: string): Promise<HelpAnswer> {
  const { data } = await api.post<HelpAnswer>("/help/ask", { question });
  return data;
}
