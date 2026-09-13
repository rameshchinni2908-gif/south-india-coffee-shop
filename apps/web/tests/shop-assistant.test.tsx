import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShopAssistantCard } from "../src/features/admin/dashboard/ShopAssistantCard.js";
import { theme } from "../src/theme.js";

const response = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, meta: {}, error: null }), {
    headers: { "Content-Type": "application/json" },
  });

const errorResponse = (message: string) =>
  new Response(
    JSON.stringify({
      success: false,
      data: null,
      meta: {},
      error: { code: "AGENT_UNAVAILABLE", message },
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );

const briefing = {
  answer: "Coffee powder — Regular is at 5.\nCheck stock before the evening rush.",
  usedShopData: true,
  generatedAt: "2026-09-10T10:00:00.000Z",
};

const renderAssistant = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <ShopAssistantCard />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

describe("shop assistant", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers only on request, sends the trimmed question and clears the answer when editing", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ agent: { enabled: true } }))
      .mockResolvedValueOnce(response({ briefing }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();

    const questionInput = await screen.findByRole("textbox", { name: "Ask about your shop" });
    expect(questionInput).toHaveValue("How is the shop doing today? What should I check first?");
    expect(questionInput).toHaveAttribute("maxlength", "500");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(questionInput, { target: { value: "  What stock should I check?  " } });
    await userEvent.click(screen.getByRole("button", { name: "Ask assistant" }));

    expect(await screen.findByText(/Coffee powder — Regular is at 5/)).toBeInTheDocument();
    expect(screen.getByText("Shop report used")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your answer" })).toBeInTheDocument();
    expect(screen.getByText(/Generated 10 Sept 2026, 3:30 pm IST/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/admin\/agent\/brief$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ question: "What stock should I check?" }),
    });

    fireEvent.change(questionInput, { target: { value: "How does pickup work?" } });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Your answer" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/Coffee powder — Regular is at 5/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fills example questions using keyboard or click without making a paid request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ agent: { enabled: true } }));
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderAssistant();

    const menuExample = await screen.findByRole("button", { name: "Menu & prices" });
    menuExample.focus();
    await visitor.keyboard("{Enter}");
    const questionInput = screen.getByRole("textbox", { name: "Ask about your shop" });
    expect(questionInput).toHaveValue("Which coffee options are available and what do they cost?");
    expect(questionInput).toHaveFocus();

    await visitor.click(screen.getByRole("button", { name: "Pickup & payment" }));
    expect(questionInput).toHaveValue("What should customers know about pickup and payment?");
    await visitor.click(screen.getByRole("button", { name: "Staff workflow" }));
    expect(questionInput).toHaveValue(
      "How should staff process an order from placed to completed?",
    );
    await visitor.click(screen.getByRole("button", { name: "Sales summary" }));
    expect(questionInput).toHaveValue("How are today's and this month's sales doing?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Your answer" })).not.toBeInTheDocument();
  });

  it("keeps unavailable and checking states clear without generating a briefing", async () => {
    let finishStatus: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishStatus = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();

    expect(screen.getByRole("status")).toHaveTextContent("Checking assistant availability");
    await act(async () => {
      finishStatus?.(response({ agent: { enabled: false } }));
    });

    expect(await screen.findByText(/The shop assistant is not available yet/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("can recheck availability after a status error without making a paid request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse("Temporarily unavailable"))
      .mockResolvedValueOnce(response({ agent: { enabled: true } }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();

    expect(
      await screen.findByText("Assistant availability could not be checked."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Ask assistant" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) => String(url).endsWith("/api/admin/agent/status")),
    ).toBe(true);
  });

  it.each([
    ["   ", "Enter a question about your shop."],
    ["a".repeat(501), "Keep your question within 500 characters."],
  ])("rejects an invalid question before sending it", async (question, message) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ agent: { enabled: true } }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();

    fireEvent.change(await screen.findByRole("textbox"), { target: { value: question } });
    await userEvent.click(screen.getByRole("button", { name: "Ask assistant" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate generation while pending and displays failures without automatic retries", async () => {
    let finishBriefing: ((value: Response) => void) | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ agent: { enabled: true } }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishBriefing = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();

    await userEvent.click(await screen.findByRole("button", { name: "Ask assistant" }));
    const pendingButton = await screen.findByRole("button", { name: "Preparing answer…" });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sales summary" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Ask the shop assistant" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishBriefing?.(errorResponse("The assistant has reached its daily limit."));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant has reached its daily limit.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ask assistant" })).toBeEnabled(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders model text safely and identifies an answer that did not use shop data", async () => {
    const answer = '<img src="invalid" onerror="alert(1)"> Ask about today’s orders.';
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ agent: { enabled: true } }))
        .mockResolvedValueOnce(
          response({ briefing: { ...briefing, answer, usedShopData: false } }),
        ),
    );
    renderAssistant();

    await userEvent.click(await screen.findByRole("button", { name: "Ask assistant" }));

    expect(await screen.findByText(answer)).toBeInTheDocument();
    expect(screen.getByText("General guidance")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("expands retrieved references as plain text and clears them when choosing another question", async () => {
    const title = '<img src="invalid" onerror="alert(1)"> Pickup policy';
    const excerpt = '<a href="https://invalid.example">Pay at the shop</a>';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ agent: { enabled: true } }))
      .mockResolvedValueOnce(
        response({
          briefing: {
            ...briefing,
            answer: "Customers pay at the shop when collecting their order.",
            usedShopData: false,
            sources: [{ id: "K1", title, kind: "knowledge", excerpt }],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const visitor = userEvent.setup();
    renderAssistant();

    await visitor.click(await screen.findByRole("button", { name: "Ask assistant" }));
    const referencesButton = await screen.findByRole("button", {
      name: "References retrieved (1)",
    });
    expect(referencesButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Shop reference notes")).toBeInTheDocument();

    referencesButton.focus();
    await visitor.keyboard("{Enter}");
    expect(referencesButton).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("heading", { name: `[K1] ${title}` })).toBeVisible();
    expect(screen.getByText(excerpt)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await visitor.click(screen.getByRole("button", { name: "Sales summary" }));
    expect(screen.queryByRole("heading", { name: "Your answer" })).not.toBeInTheDocument();
    expect(screen.queryByText(excerpt)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["menu", "report"] as const)(
    "labels retrieved %s references as live shop data",
    async (kind) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(response({ agent: { enabled: true } }))
          .mockResolvedValueOnce(
            response({
              briefing: {
                ...briefing,
                sources: [{ id: kind, title: "Shop information", kind, excerpt: "Current data" }],
              },
            }),
          ),
      );
      renderAssistant();

      await userEvent.click(await screen.findByRole("button", { name: "Ask assistant" }));
      expect(await screen.findByText("Live shop data")).toBeInTheDocument();
    },
  );

  it("shows general guidance when no references were retrieved", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ agent: { enabled: true } }))
        .mockResolvedValueOnce(response({ briefing: { ...briefing, sources: [] } })),
    );
    renderAssistant();

    await userEvent.click(await screen.findByRole("button", { name: "Ask assistant" }));
    expect(await screen.findByText("General guidance")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /References retrieved/ })).not.toBeInTheDocument();
  });
});
