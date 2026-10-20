import { z } from "zod";
import { DEFAULT_GATE } from "../contract";

const name = z.string().trim().min(1).max(200);
export const stateSchema = z.enum(["DRAFT", "EVALUATING", "CANARY", "EXPANDING", "PROMOTED", "ROLLED_BACK", "HOLD", "ABANDONED"]);
export const createSchema = z.object({
  baseline: name,
  candidate: name,
  alpha: z.number().gt(0).lt(1).default(DEFAULT_GATE.alpha),
  margin: z.number().min(0).max(1).default(DEFAULT_GATE.margin),
  maxTrials: z.number().int().positive().max(2147483647).default(DEFAULT_GATE.maxTrials),
  mode: z.enum(["superiority", "noninferiority"]).default(DEFAULT_GATE.mode),
}).strict().refine(value => value.baseline !== value.candidate, { message: "Baseline and candidate must differ" });
export const replaySchema = z.object({ batch: z.number().int().min(1).max(2000).default(25), expectedCursor: z.number().int().min(0).optional() }).strict();
export const overrideSchema = z.object({
  toState: stateSchema, actor: name, reason: z.string().trim().min(10).max(10000),
  maxTrials: z.number().int().positive().max(2147483647).optional(),
}).strict();
export const resumeSchema = z.object({
  maxTrials: z.number().int().positive().max(2147483647), actor: name, reason: z.string().trim().min(10).max(10000),
}).strict();
export const guardrailSchema = z.object({ sliceName: name, approvedBy: name }).strict();
export const trialSchema = z.object({
  sessionId: z.uuid(), occurredAt: z.iso.datetime({ offset: true }), site: name,
  instruction: z.string().trim().min(1).max(20000), notes: z.string().max(100000).default(""),
  results: z.array(z.object({
    policy: name, success: z.union([z.literal(0), z.literal(1)]), progress: z.number().min(0).max(1),
    durationS: z.number().int().min(0).max(2147483647).nullable().optional(),
  }).strict()).min(1).max(100),
}).strict();
export type CreateInput = z.infer<typeof createSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;
export type TrialInput = z.infer<typeof trialSchema>;
