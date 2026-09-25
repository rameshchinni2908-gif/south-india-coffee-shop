import { z } from "zod";

// The assistant never changes shop records. These tools only record a proposal that an
// admin must approve in the app; the approval then runs the normal product service.
export const PROPOSAL_TOOL_NAMES = ["propose_stock_update", "propose_availability_change"] as const;
export type ProposalToolName = (typeof PROPOSAL_TOOL_NAMES)[number];

export const MAX_PROPOSALS_PER_RUN = 3;
export const MAX_PROPOSED_STOCK = 10_000;

const target = {
  productName: z.string().trim().min(1).max(150),
  // Null means the product's only size (stock) or every size (availability).
  variantName: z.string().trim().min(1).max(80).nullable(),
};

export const proposalArgumentSchemas = {
  propose_stock_update: z
    .object({
      ...target,
      // "add" is resolved against live stock on the server, so the model never does arithmetic
      // on figures it may not have read.
      mode: z.enum(["set", "add"]),
      quantity: z.number().int().min(0).max(MAX_PROPOSED_STOCK),
    })
    .strict(),
  propose_availability_change: z.object({ ...target, isAvailable: z.boolean() }).strict(),
} as const;

export type ProposedChange =
  | ({ kind: "STOCK" } & z.infer<(typeof proposalArgumentSchemas)["propose_stock_update"]>)
  | ({ kind: "AVAILABILITY" } & z.infer<
      (typeof proposalArgumentSchemas)["propose_availability_change"]
    >);

export const toProposedChange = (name: ProposalToolName, argumentsJson: string): ProposedChange => {
  const parsed = JSON.parse(argumentsJson) as unknown;
  return name === "propose_stock_update"
    ? { kind: "STOCK", ...proposalArgumentSchemas.propose_stock_update.parse(parsed) }
    : {
        kind: "AVAILABILITY",
        ...proposalArgumentSchemas.propose_availability_change.parse(parsed),
      };
};

// What the model learns about its proposal. It is told plainly that nothing has changed.
export type ProposalToolResult =
  | {
      status: "PROPOSED";
      proposalId: string;
      summary: string;
      expiresAt: string;
      appliedNow: false;
    }
  | { status: "NOT_PROPOSED"; reason: string };

export interface ProposalSummary {
  id: string;
  summary: string;
  expiresAt: string;
}

const targetProperties = {
  productName: {
    type: "string",
    description: "Exact product name from the live menu.",
  },
  variantName: {
    type: ["string", "null"],
    description:
      "Exact size name, or null for a single-size product (or all sizes for availability).",
  },
} as const;

export const PROPOSAL_TOOLS = [
  {
    type: "function",
    name: "propose_stock_update",
    description:
      "Prepare a stock change for one size for the admin to approve: set an exact quantity or add units to the current stock. Nothing changes until the admin approves it in the app.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        ...targetProperties,
        mode: {
          type: "string",
          enum: ["set", "add"],
          description:
            "set: make stock exactly `quantity`. add: increase current stock by `quantity`.",
        },
        quantity: { type: "integer", description: "Units to set or add (0 or more)." },
      },
      required: ["productName", "variantName", "mode", "quantity"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "propose_availability_change",
    description:
      "Prepare marking a size available or unavailable (sold out) for the admin to approve. Nothing changes until the admin approves it in the app.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        ...targetProperties,
        isAvailable: { type: "boolean", description: "true to allow ordering, false to stop it." },
      },
      required: ["productName", "variantName", "isAvailable"],
      additionalProperties: false,
    },
  },
] as const;
