import {
  MAX_PROPOSED_STOCK,
  type ProposalToolResult,
  type ProposedChange,
} from "../agents/action-proposals.js";
import { HttpError } from "../middleware/http-error.js";
import type {
  ActionProposalChange,
  ActionProposalRecord,
  ActionProposalRepository,
} from "../repositories/action-proposal-repository.js";
import type { ProductRecord } from "../types/catalog.js";
import type { ProductService } from "./product-service.js";

// Long enough to read and decide, short enough that the numbers are still current.
export const PROPOSAL_LIFETIME_MINUTES = 15;
const MENU_LIMIT = 100;

export type ProposalViewStatus = ActionProposalRecord["status"] | "EXPIRED";

export interface ProposalView {
  id: string;
  summary: string;
  status: ProposalViewStatus;
  expiresAt: string;
  decidedAt: string | null;
  failureReason: string | null;
}

export interface ActionProposalService {
  propose(adminId: string, change: ProposedChange): Promise<ProposalToolResult>;
  approve(id: string, adminId: string): Promise<ProposalView>;
  reject(id: string, adminId: string): Promise<ProposalView>;
}

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const describe = (field: ActionProposalChange["field"], value: number | boolean) =>
  field === "stockQuantity" ? `stock ${String(value)}` : value ? "available" : "unavailable";

export const createActionProposalService = ({
  repository,
  productService,
  now = () => new Date(),
}: {
  repository: ActionProposalRepository;
  productService: Pick<ProductService, "listPublic" | "getAdminById" | "updateAvailability">;
  now?: () => Date;
}): ActionProposalService => {
  const view = (proposal: ActionProposalRecord): ProposalView => ({
    id: proposal.id,
    summary: proposal.summary,
    status:
      proposal.status === "PENDING" && proposal.expiresAt <= now() ? "EXPIRED" : proposal.status,
    expiresAt: proposal.expiresAt.toISOString(),
    decidedAt: proposal.decidedAt?.toISOString() ?? null,
    failureReason: proposal.failureReason,
  });

  // Explains why a claim failed: unknown, someone else's, expired or already decided.
  const explainUnclaimable = async (id: string, adminId: string): Promise<never> => {
    const proposal = await repository.findById(id);
    if (!proposal || proposal.adminId !== adminId) {
      throw new HttpError(404, "PROPOSAL_NOT_FOUND", "That proposed change was not found.");
    }
    const status = view(proposal).status;
    throw new HttpError(
      409,
      "PROPOSAL_NOT_PENDING",
      status === "EXPIRED"
        ? "This proposal has expired. Ask the assistant again for current figures."
        : `This proposal is already ${status.toLowerCase()}.`,
    );
  };

  const findProduct = (products: ProductRecord[], name: string) =>
    products.find((product) => normalise(product.name) === normalise(name));

  return {
    async propose(adminId, change) {
      const { items: products } = await productService.listPublic({
        page: 1,
        limit: MENU_LIMIT,
        available: "all",
        sortBy: "name",
        sortOrder: "asc",
      });
      // Names come from the model; the ids used to apply the change come from the database.
      const product = findProduct(products, change.productName);
      if (!product) {
        return {
          status: "NOT_PROPOSED",
          reason: `No active product is named "${change.productName}". Use an exact name from the live menu.`,
        };
      }
      const sizes = product.variants.map((variant) => variant.name).join(", ");
      let variants = product.variants;
      if (change.variantName !== null) {
        variants = product.variants.filter(
          (variant) => normalise(variant.name) === normalise(change.variantName!),
        );
        if (variants.length === 0) {
          return {
            status: "NOT_PROPOSED",
            reason: `${product.name} has no size "${change.variantName}". Sizes: ${sizes}.`,
          };
        }
      } else if (change.kind === "STOCK" && variants.length > 1) {
        return {
          status: "NOT_PROPOSED",
          reason: `${product.name} has several sizes (${sizes}); ask which size to restock.`,
        };
      }

      const changes: ActionProposalChange[] = variants.flatMap((variant) => {
        const field = change.kind === "STOCK" ? "stockQuantity" : "isAvailable";
        const from = change.kind === "STOCK" ? variant.stockQuantity : variant.isAvailable;
        const to =
          change.kind === "AVAILABILITY"
            ? change.isAvailable
            : change.mode === "add"
              ? variant.stockQuantity + change.quantity
              : change.quantity;
        return from === to
          ? []
          : [{ variantId: variant.id, variantName: variant.name, field, from, to }];
      });
      if (changes.length === 0) {
        return { status: "NOT_PROPOSED", reason: "Nothing to change: the value is already set." };
      }

      if (changes.some(({ to }) => typeof to === "number" && to > MAX_PROPOSED_STOCK)) {
        return {
          status: "NOT_PROPOSED",
          reason: `Stock cannot exceed ${MAX_PROPOSED_STOCK} units.`,
        };
      }
      const stillUnavailable = change.kind === "STOCK" && !variants[0]!.isAvailable;
      const summary = `${product.name}: ${changes
        .map(({ variantName, field, from, to }) =>
          field === "stockQuantity"
            ? `${variantName} stock ${String(from)} → ${String(to)}`
            : `${variantName} ${describe(field, from)} → ${describe(field, to)}`,
        )
        .join(
          "; ",
        )}${stillUnavailable ? " (stays unavailable until availability is turned on)" : ""}`;
      const createdAt = now();
      const proposal = await repository.create({
        adminId,
        kind: change.kind,
        productId: product.id,
        productName: product.name,
        changes,
        summary,
        expiresAt: new Date(createdAt.getTime() + PROPOSAL_LIFETIME_MINUTES * 60_000),
        createdAt,
      });
      return {
        status: "PROPOSED",
        proposalId: proposal.id,
        summary,
        expiresAt: proposal.expiresAt.toISOString(),
        appliedNow: false,
      };
    },

    async approve(id, adminId) {
      const claimed = await repository.claimPending(id, adminId, now(), "APPLYING");
      if (!claimed) return explainUnclaimable(id, adminId);

      let failureReason: string | null = null;
      try {
        const product = await productService.getAdminById(claimed.productId);
        // Optimistic check: refuse if an order or another edit changed the value since.
        for (const change of claimed.changes) {
          const current = product.variants.find((variant) => variant.id === change.variantId);
          const value = current?.[change.field];
          if (value !== change.from) {
            failureReason = `${change.variantName} changed since this was proposed (now ${
              value === undefined ? "removed" : describe(change.field, value)
            }). Ask again for current figures.`;
            break;
          }
        }
        if (!failureReason) {
          await productService.updateAvailability(claimed.productId, {
            variants: claimed.changes.map(({ variantId, field, to }) =>
              field === "stockQuantity"
                ? { id: variantId, stockQuantity: to as number }
                : { id: variantId, isAvailable: to as boolean },
            ),
          });
        }
      } catch (error) {
        // Product-service errors carry safe messages; anything else stays generic.
        failureReason =
          error instanceof HttpError ? error.message : "The change could not be applied.";
      }

      const finished = await repository.finish(claimed.id, {
        status: failureReason ? "FAILED" : "APPLIED",
        decidedAt: now(),
        failureReason,
      });
      return view(finished ?? claimed);
    },

    async reject(id, adminId) {
      const rejected = await repository.claimPending(id, adminId, now(), "REJECTED");
      return rejected ? view(rejected) : explainUnclaimable(id, adminId);
    },
  };
};
