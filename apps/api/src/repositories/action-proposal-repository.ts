import { isValidObjectId, type Types } from "mongoose";

import {
  ActionProposalModel,
  type ACTION_PROPOSAL_KINDS,
  type ACTION_PROPOSAL_STATUSES,
} from "../models/action-proposal-model.js";

export type ActionProposalStatus = (typeof ACTION_PROPOSAL_STATUSES)[number];

export interface ActionProposalChange {
  variantId: string;
  variantName: string;
  field: "stockQuantity" | "isAvailable";
  from: number | boolean;
  to: number | boolean;
}

export interface NewActionProposal {
  adminId: string;
  kind: (typeof ACTION_PROPOSAL_KINDS)[number];
  productId: string;
  productName: string;
  changes: ActionProposalChange[];
  summary: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ActionProposalRecord extends NewActionProposal {
  id: string;
  status: ActionProposalStatus;
  decidedAt: Date | null;
  failureReason: string | null;
}

export interface ActionProposalRepository {
  create(proposal: NewActionProposal): Promise<ActionProposalRecord>;
  findById(id: string): Promise<ActionProposalRecord | null>;
  // Atomically moves one of this admin's unexpired PENDING proposals to a new status.
  claimPending(
    id: string,
    adminId: string,
    now: Date,
    status: "APPLYING" | "REJECTED",
  ): Promise<ActionProposalRecord | null>;
  finish(
    id: string,
    result: { status: "APPLIED" | "FAILED"; decidedAt: Date; failureReason: string | null },
  ): Promise<ActionProposalRecord | null>;
}

type StoredProposal = Omit<ActionProposalRecord, "id"> & { _id: Types.ObjectId };

const toRecord = ({ _id, ...proposal }: StoredProposal): ActionProposalRecord => ({
  ...proposal,
  id: _id.toString(),
  decidedAt: proposal.decidedAt ?? null,
  failureReason: proposal.failureReason ?? null,
});

export class MongooseActionProposalRepository implements ActionProposalRepository {
  public async create(proposal: NewActionProposal) {
    const created = await ActionProposalModel.create(proposal);
    return toRecord(created.toObject() as StoredProposal);
  }

  public async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    const proposal = await ActionProposalModel.findById(id).lean<StoredProposal>().exec();
    return proposal ? toRecord(proposal) : null;
  }

  public async claimPending(
    id: string,
    adminId: string,
    now: Date,
    status: "APPLYING" | "REJECTED",
  ) {
    if (!isValidObjectId(id)) return null;
    // One atomic update: two concurrent approvals cannot both succeed.
    const proposal = await ActionProposalModel.findOneAndUpdate(
      { _id: id, adminId, status: "PENDING", expiresAt: { $gt: now } },
      { $set: { status, ...(status === "REJECTED" ? { decidedAt: now } : {}) } },
      { returnDocument: "after" },
    )
      .lean<StoredProposal>()
      .exec();
    return proposal ? toRecord(proposal) : null;
  }

  public async finish(
    id: string,
    result: { status: "APPLIED" | "FAILED"; decidedAt: Date; failureReason: string | null },
  ) {
    const proposal = await ActionProposalModel.findOneAndUpdate(
      { _id: id, status: "APPLYING" },
      { $set: result },
      { returnDocument: "after" },
    )
      .lean<StoredProposal>()
      .exec();
    return proposal ? toRecord(proposal) : null;
  }
}
