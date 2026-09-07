import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TIP_JAR_ADDRESS, TIP_JAR_SNS, TipJar } from "./TipJar";

describe("TipJar", () => {
  const writeText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shows only the approved public identity and copies the canonical address", async () => {
    writeText.mockResolvedValue(undefined);
    const { container } = render(<TipJar />);

    expect(screen.getByText(TIP_JAR_SNS)).toBeInTheDocument();
    expect(screen.getByText(TIP_JAR_ADDRESS)).toBeInTheDocument();
    expect(
      screen.getByText(/support is appreciated but never required/i),
    ).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(TIP_JAR_ADDRESS),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Address copied.");
  });

  it("announces a clipboard failure without hiding the full address", async () => {
    writeText.mockRejectedValue(new Error("Clipboard denied"));
    render(<TipJar />);

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Copy failed. Select and copy the full address instead.",
    );
    expect(screen.getByText(TIP_JAR_ADDRESS)).toBeVisible();
  });

  it("reports an unavailable clipboard API", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    render(<TipJar />);

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/copy failed/i);
    expect(screen.getByText(TIP_JAR_ADDRESS)).toBeVisible();
  });
});
