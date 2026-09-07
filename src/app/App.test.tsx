import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../chart/ReferenceChart", () => ({
  ReferenceChart: () => <div aria-label="Sample chart" role="img" />,
}));

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  it("explains the CA entry and validates token and RPC inputs", () => {
    render(<App />);

    expect(
      screen.getByText(/enter a solana token contract address/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/token contract address/i), {
      target: { value: "not-a-solana-address" },
    });
    fireEvent.click(screen.getByRole("button", { name: /load token/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid solana/i);

    fireEvent.change(screen.getByLabelText(/solana rpc endpoint/i), {
      target: { value: "http://rpc.example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect rpc/i }));
    expect(screen.getByText("Use an HTTPS RPC endpoint.")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("keeps RPC state in memory and clears the form value after connection", () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<App />);

    const rpcInput = screen.getByLabelText(/solana rpc endpoint/i);
    fireEvent.change(rpcInput, {
      target: { value: "https://rpc.example.invalid/?key=unit-test-only" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect rpc/i }));

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(rpcInput).toHaveValue("");
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(window.sessionStorage).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("preserves session inputs and workspace mode across Docs navigation", () => {
    render(<App />);
    const rpcInput = screen.getByLabelText(/solana rpc endpoint/i);
    const tokenInput = screen.getByLabelText(/token contract address/i);

    fireEvent.change(rpcInput, {
      target: { value: "https://rpc.example.invalid/?key=route-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /connect rpc/i }));
    fireEvent.change(tokenInput, { target: { value: "draft-token-ca" } });
    fireEvent.click(screen.getByRole("button", { name: "Positions" }));
    expect(screen.getByRole("button", { name: "Positions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    act(() => {
      window.location.hash = "#/docs";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("heading", { name: "Docs" })).toHaveFocus();
    expect(
      screen.getByText(/one coherent, complete valuation generation/i),
    ).toBeInTheDocument();

    act(() => {
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByLabelText(/token contract address/i)).toHaveValue(
      "draft-token-ca",
    );
    expect(screen.getByRole("button", { name: "Positions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves keyboard focus past navigation without changing the hash route", () => {
    render(<App />);
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    fireEvent.click(skip);
    expect(
      screen.getByRole("heading", {
        name: /see where meteora liquidity sits/i,
      }),
    ).toHaveFocus();
    expect(window.location.hash).toBe("#/");
  });
});
