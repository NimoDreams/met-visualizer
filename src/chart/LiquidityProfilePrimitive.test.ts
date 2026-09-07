import { describe, expect, it, vi } from "vitest";
import type { LiquidityLevel } from "../domain/liquidityOverlay";
import { LiquidityProfilePrimitive } from "./LiquidityProfilePrimitive";

describe("LiquidityProfilePrimitive", () => {
  it("draws price-aligned horizontal rows and exposes aggregated hover contributions", () => {
    const fills: number[][] = [];
    const requestUpdate = vi.fn();
    const primitive = new LiquidityProfilePrimitive([
      level("first", 100, 60n, "position-a"),
      level("second", 104, 40n, "position-b"),
    ]);
    primitive.attached({
      series: { priceToCoordinate: (price: number) => price / 10 },
      requestUpdate,
    } as never);
    const renderer = primitive.paneViews()[0]?.renderer();
    renderer?.draw({
      useBitmapCoordinateSpace: (draw: (scope: unknown) => void) =>
        draw({
          context: {
            fillStyle: "",
            save: vi.fn(),
            restore: vi.fn(),
            fillRect: (...values: number[]) => fills.push(values),
          },
          bitmapSize: { width: 100, height: 100 },
          horizontalPixelRatio: 1,
          verticalPixelRatio: 1,
        }),
    } as never);

    expect(fills).toHaveLength(1);
    const hit = primitive.hitTest(99, 10);
    expect(hit).toMatchObject({ zOrder: "top", cursorStyle: "crosshair" });
    const hover = primitive.hover(hit?.externalId);
    expect(hover).toMatchObject({
      minimumPrice: 100,
      maximumPrice: 104,
      valueUsd: { numerator: 100n, denominator: 1n },
    });
    expect(hover?.contributions.map(({ positionKey }) => positionKey)).toEqual([
      "pool:position-a",
      "pool:position-b",
    ]);
    expect(requestUpdate).toHaveBeenCalledOnce();
  });

  it("supports keyboard-level highlighting and clears resources on detach", () => {
    const requestUpdate = vi.fn();
    const primitive = new LiquidityProfilePrimitive([
      level("first", 100, 1n, "position-a"),
    ]);
    primitive.attached({
      series: { priceToCoordinate: () => 10 },
      requestUpdate,
    } as never);
    primitive
      .paneViews()[0]
      ?.renderer()
      ?.draw({
        useBitmapCoordinateSpace: (draw: (scope: unknown) => void) =>
          draw({
            context: {
              fillStyle: "",
              save: vi.fn(),
              restore: vi.fn(),
              fillRect: vi.fn(),
            },
            bitmapSize: { width: 100, height: 100 },
            horizontalPixelRatio: 1,
            verticalPixelRatio: 1,
          }),
      } as never);

    expect(primitive.hoverLevel("first")?.contributions).toHaveLength(1);
    primitive.hoverLevel(undefined);
    expect(requestUpdate).toHaveBeenCalledTimes(2);
    primitive.detached();
    expect(primitive.hitTest(99, 10)).toBeNull();
  });

  it("buckets 7,200 dense levels and navigates only unique visible rows", () => {
    const fills: number[][] = [];
    const levels = Array.from({ length: 7_200 }, (_, index) =>
      level(String(index), index, 1n, `position-${index}`),
    );
    const primitive = new LiquidityProfilePrimitive(levels);
    primitive.attached({
      series: {
        priceToCoordinate: (price: number) => {
          if (price < 100) return -1;
          if (price >= 7_100) return 101;
          return Math.floor((price - 100) / 70);
        },
      },
      requestUpdate: vi.fn(),
    } as never);
    const startedAt = performance.now();
    primitive
      .paneViews()[0]
      ?.renderer()
      ?.draw({
        useBitmapCoordinateSpace: (draw: (scope: unknown) => void) =>
          draw({
            context: {
              fillStyle: "",
              save: vi.fn(),
              restore: vi.fn(),
              fillRect: (...values: number[]) => fills.push(values),
            },
            bitmapSize: { width: 800, height: 100 },
            horizontalPixelRatio: 1,
            verticalPixelRatio: 1,
          }),
      } as never);

    expect(primitive.renderedRowCount()).toBe(100);
    expect(fills).toHaveLength(100);
    const traversed = Array.from({ length: 100 }, () => {
      const hover = primitive.moveHover(1)!;
      return `${hover.minimumPrice}:${hover.maximumPrice}`;
    });
    expect(new Set(traversed).size).toBe(100);
    expect(primitive.moveHover(1)).toMatchObject({
      minimumPrice: 100,
      maximumPrice: 169,
    });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});

function level(
  id: string,
  axisPrice: number,
  value: bigint,
  positionAddress: string,
): LiquidityLevel {
  return {
    id,
    axisPrice,
    valueUsd: { numerator: value, denominator: 1n },
    contributions: [
      {
        id: `${id}:contribution`,
        poolAddress: "pool",
        poolLabel: "POOL",
        positionAddress,
        positionKey: `pool:${positionAddress}`,
        binId: 1,
        axisPrice,
        valueUsd: { numerator: value, denominator: 1n },
      },
    ],
  };
}
