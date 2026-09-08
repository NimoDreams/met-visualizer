import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useReferenceMarket: vi.fn(),
}));

vi.mock("../app/useReferenceMarket", () => ({
  useReferenceMarket: mocks.useReferenceMarket,
}));

vi.mock("./ReferenceChart", () => ({
  ReferenceChart: () => <div aria-label="Reference chart" role="img" />,
}));

import { ReferenceMarketPanel } from "./ReferenceMarketPanel";

describe("ReferenceMarketPanel provider errors", () => {
  beforeEach(() => {
    mocks.useReferenceMarket.mockReset();
  });

  it.each([
    [
      "timeout",
      "Public request timed out",
      "GeckoTerminal request timed out. Try again.",
    ],
    [
      "network",
      "Network request failed",
      "GeckoTerminal could not be reached. Its public API may be unavailable or rate limiting browser requests; try again shortly.",
    ],
    [
      "rate-limit",
      "Public request limit reached",
      "GeckoTerminal is rate limiting public requests. Try again shortly.",
    ],
  ] as const)("renders %s distinctly", (kind, title, message) => {
    mocks.useReferenceMarket.mockReturnValue({
      state: { status: "error", kind, message },
      retry: vi.fn(),
      refresh: vi.fn(),
      changeInterval: vi.fn(),
      changeMarket: vi.fn(),
      loadOlder: vi.fn(),
    });

    render(<ReferenceMarketPanel mint="fixture-mint" />);

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });
});
