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

  it("generates only on request, sends the trimmed question and shows the report source and time", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Generate briefing" }));

    expect(await screen.findByText(/Coffee powder — Regular is at 5/)).toBeInTheDocument();
    expect(screen.getByText("Shop report used")).toBeInTheDocument();
    expect(screen.getByText(/Report as of 10 Sept 2026, 3:30 pm IST/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/api\/admin\/agent\/brief$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ question: "What stock should I check?" }),
    });
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
    expect(await screen.findByRole("button", { name: "Generate briefing" })).toBeEnabled();
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
    await userEvent.click(screen.getByRole("button", { name: "Generate briefing" }));

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

    await userEvent.click(await screen.findByRole("button", { name: "Generate briefing" }));
    const pendingButton = await screen.findByRole("button", { name: "Preparing briefing…" });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Ask the shop assistant" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishBriefing?.(errorResponse("The assistant has reached its daily limit."));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The assistant has reached its daily limit.",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Generate briefing" })).toBeEnabled(),
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

    await userEvent.click(await screen.findByRole("button", { name: "Generate briefing" }));

    expect(await screen.findByText(answer)).toBeInTheDocument();
    expect(screen.getByText("General guidance")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
