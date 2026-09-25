import { describe, expect, it, vi } from "vitest";

import type { ProposedChange } from "../src/agents/action-proposals.js";
import { HttpError } from "../src/middleware/http-error.js";
import type {
  ActionProposalRecord,
  ActionProposalRepository,
} from "../src/repositories/action-proposal-repository.js";
import { createActionProposalService } from "../src/services/action-proposal-service.js";
import type { ProductService } from "../src/services/product-service.js";
import type { ProductRecord } from "../src/types/catalog.js";

const START = new Date("2026-09-25T08:00:00.000Z");

const product = (
  id: string,
  name: string,
  variants: [string, number, boolean][],
): ProductRecord => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  description: "",
  categoryId: "category",
  imageUrl: "",
  isVegetarian: true,
  variants: variants.map(([variantName, stockQuantity, isAvailable]) => ({
    id: `${id}-${variantName.toLowerCase()}`,
    name: variantName,
    sku: `${id}-${variantName}`.toUpperCase(),
    price: 3_000,
    stockQuantity,
    isAvailable,
  })),
  isActive: true,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  lowStockThreshold: 5,
  createdAt: START,
  updatedAt: START,
});

const createFixture = () => {
  let clock = START;
  const catalog = [
    product("coffee", "Filter Coffee", [
      ["Regular", 40, true],
      ["Large", 0, true],
    ]),
    product("vada", "Medu Vada", [["Plate", 12, false]]),
  ];
  const proposals = new Map<string, ActionProposalRecord>();
  const repository: ActionProposalRepository = {
    create: async (data) => {
      const record: ActionProposalRecord = {
        ...data,
        id: `p${proposals.size + 1}`,
        status: "PENDING",
        decidedAt: null,
        failureReason: null,
      };
      proposals.set(record.id, record);
      return { ...record };
    },
    findById: async (id) => (proposals.has(id) ? { ...proposals.get(id)! } : null),
    claimPending: async (id, adminId, now, status) => {
      const record = proposals.get(id);
      if (!record || record.adminId !== adminId || record.status !== "PENDING") return null;
      if (record.expiresAt <= now) return null;
      Object.assign(record, { status, ...(status === "REJECTED" ? { decidedAt: now } : {}) });
      return { ...record };
    },
    finish: async (id, result) => {
      const record = proposals.get(id);
      if (!record || record.status !== "APPLYING") return null;
      Object.assign(record, result);
      return { ...record };
    },
  };
  const productService = {
    listPublic: vi.fn<ProductService["listPublic"]>(async () => ({
      items: catalog,
      meta: { page: 1, limit: 100, total: catalog.length, totalPages: 1 },
    })),
    getAdminById: vi.fn<ProductService["getAdminById"]>(async (id) =>
      catalog.find((item) => item.id === id)!,
    ),
    updateAvailability: vi.fn<ProductService["updateAvailability"]>(async (id) =>
      catalog.find((item) => item.id === id)!,
    ),
  };
  const service = createActionProposalService({
    repository,
    productService,
    now: () => clock,
  });
  return {
    service,
    productService,
    catalog,
    proposals,
    advance: (minutes: number) => {
      clock = new Date(clock.getTime() + minutes * 60_000);
    },
  };
};

const stock = (fields: Partial<Extract<ProposedChange, { kind: "STOCK" }>>): ProposedChange => ({
  kind: "STOCK",
  productName: "Medu Vada",
  variantName: null,
  mode: "set",
  quantity: 20,
  ...fields,
});

describe("proposing changes", () => {
  it("resolves names against the live menu and adds to the current stock", async () => {
    const { service, proposals } = createFixture();

    const result = await service.propose("admin-1", stock({ mode: "add", quantity: 20 }));

    expect(result).toEqual({
      status: "PROPOSED",
      proposalId: "p1",
      summary: "Medu Vada: Plate stock 12 → 32 (stays unavailable until availability is turned on)",
      expiresAt: "2026-09-25T08:15:00.000Z",
      appliedNow: false,
    });
    // Ids come from the database, never from the model.
    expect(proposals.get("p1")).toMatchObject({
      productId: "vada",
      changes: [{ variantId: "vada-plate", field: "stockQuantity", from: 12, to: 32 }],
    });
  });

  it("marks every size unavailable when no size is given, skipping unchanged ones", async () => {
    const { service, proposals } = createFixture();

    const result = await service.propose("admin-1", {
      kind: "AVAILABILITY",
      productName: "  filter   coffee ",
      variantName: null,
      isAvailable: false,
    });

    expect(result).toMatchObject({
      status: "PROPOSED",
      summary: "Filter Coffee: Regular available → unavailable; Large available → unavailable",
    });
    expect(proposals.get("p1")?.changes).toHaveLength(2);
  });

  it.each([
    [stock({ productName: "Pizza" }), /No active product is named "Pizza"/],
    [stock({ productName: "Medu Vada", variantName: "Bowl" }), /no size "Bowl". Sizes: Plate/],
    [stock({ productName: "Filter Coffee" }), /several sizes \(Regular, Large\)/],
    [stock({ quantity: 12 }), /already set/],
    [stock({ mode: "add", quantity: 9_999 }), /cannot exceed 10000/],
  ])("explains why a change cannot be proposed (%#)", async (change, reason) => {
    const { service, proposals } = createFixture();

    const result = await service.propose("admin-1", change);

    expect(result).toMatchObject({ status: "NOT_PROPOSED", reason: expect.stringMatching(reason) });
    expect(proposals.size).toBe(0);
  });
});

describe("approving and rejecting", () => {
  it("applies an approved change through the product service exactly once", async () => {
    const { service, productService } = createFixture();
    await service.propose("admin-1", stock({ quantity: 30 }));

    const approved = await service.approve("p1", "admin-1");

    expect(approved).toMatchObject({ status: "APPLIED", failureReason: null });
    expect(productService.updateAvailability).toHaveBeenCalledWith("vada", {
      variants: [{ id: "vada-plate", stockQuantity: 30 }],
    });
    await expect(service.approve("p1", "admin-1")).rejects.toMatchObject({
      statusCode: 409,
      message: "This proposal is already applied.",
    });
    expect(productService.updateAvailability).toHaveBeenCalledTimes(1);
  });

  it("refuses to apply when the value changed since it was proposed", async () => {
    const { service, productService, catalog } = createFixture();
    await service.propose("admin-1", stock({ quantity: 30 }));
    // An order was confirmed in the meantime.
    catalog[1]!.variants[0]!.stockQuantity = 10;

    const result = await service.approve("p1", "admin-1");

    expect(result).toMatchObject({
      status: "FAILED",
      failureReason: expect.stringContaining("changed since this was proposed (now stock 10)"),
    });
    expect(productService.updateAvailability).not.toHaveBeenCalled();
  });

  it("records a safe reason when the product service rejects the change", async () => {
    const { service, productService } = createFixture();
    await service.propose("admin-1", stock({ quantity: 30 }));
    productService.updateAvailability.mockRejectedValueOnce(
      new HttpError(409, "PRODUCT_ARCHIVED", "Archived products cannot be modified"),
    );

    expect(await service.approve("p1", "admin-1")).toMatchObject({
      status: "FAILED",
      failureReason: "Archived products cannot be modified",
    });
  });

  it("keeps each admin's proposals private and expires them", async () => {
    const { service, productService, advance } = createFixture();
    await service.propose("admin-1", stock({ quantity: 30 }));

    await expect(service.approve("p1", "admin-2")).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.approve("missing", "admin-1")).rejects.toMatchObject({ statusCode: 404 });
    advance(16);
    await expect(service.approve("p1", "admin-1")).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("expired"),
    });
    expect(productService.updateAvailability).not.toHaveBeenCalled();
  });

  it("rejects a proposal so it can no longer be approved", async () => {
    const { service, productService } = createFixture();
    await service.propose("admin-1", stock({ quantity: 30 }));

    expect(await service.reject("p1", "admin-1")).toMatchObject({
      status: "REJECTED",
      decidedAt: "2026-09-25T08:00:00.000Z",
    });
    await expect(service.approve("p1", "admin-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(productService.updateAvailability).not.toHaveBeenCalled();
  });
});
