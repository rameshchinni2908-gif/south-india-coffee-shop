import { Schema, model } from "mongoose";

export const ACTION_PROPOSAL_STATUSES = [
  "PENDING",
  // Claimed by one approval request; prevents a double apply.
  "APPLYING",
  "APPLIED",
  "REJECTED",
  "FAILED",
] as const;
export const ACTION_PROPOSAL_KINDS = ["STOCK", "AVAILABILITY"] as const;
// Proposals are kept as an audit trail, then removed.
export const ACTION_PROPOSAL_RETENTION_DAYS = 90;

const actionProposalSchema = new Schema(
  {
    adminId: { type: String, required: true, index: true },
    kind: { type: String, enum: ACTION_PROPOSAL_KINDS, required: true },
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    changes: [
      {
        _id: false,
        variantId: { type: String, required: true },
        variantName: { type: String, required: true },
        field: { type: String, enum: ["stockQuantity", "isAvailable"], required: true },
        // The value the admin saw; approval fails if the product no longer matches it.
        from: { type: Schema.Types.Mixed, required: true },
        to: { type: Schema.Types.Mixed, required: true },
      },
    ],
    summary: { type: String, required: true },
    status: { type: String, enum: ACTION_PROPOSAL_STATUSES, required: true, default: "PENDING" },
    expiresAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

actionProposalSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ACTION_PROPOSAL_RETENTION_DAYS * 24 * 60 * 60 },
);

export const ActionProposalModel = model("ActionProposal", actionProposalSchema);
