export type Confidence = {
  level: "high" | "medium" | "low";
  score: number;
  basis: string[];
};

export type ToolStep = {
  id: string;
  name: string;
  input: unknown;
  status: "running" | "ok" | "failed";
  summary?: string;
  confidence?: Confidence;
};

export type Grounding = {
  checked: number;
  grounded: number;
  unverified: string[];
};

export type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps: ToolStep[];
  grounding?: Grounding;
  error?: { message: string; hint?: string };
  streaming?: boolean;
};

/** The weakest rating across an answer's queries sets the answer's rating. */
export function weakestConfidence(steps: ToolStep[]): Confidence | undefined {
  const rated = steps.map((s) => s.confidence).filter((c): c is Confidence => !!c);
  if (!rated.length) return undefined;
  return rated.reduce((a, b) => (b.score < a.score ? b : a));
}

export type BoardStatus = {
  slug: string;
  name: string;
  id: string;
  rows: number;
  fields: number;
  completeness: number;
  issues: number;
};

export type StatusResponse =
  | { ok: true; fetchedAt: string; boards: BoardStatus[] }
  | { ok: false; stage: string; message: string };
