import { fireEvent, render, screen } from "@testing-library/react";
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
});
