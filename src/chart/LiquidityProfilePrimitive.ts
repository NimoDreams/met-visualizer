import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type {
  LiquidityContribution,
  LiquidityLevel,
} from "../domain/liquidityOverlay";
import {
  addRational,
  compareRational,
  type Rational,
} from "../domain/positionValuation";

type HitRow = {
  id: string;
  y: number;
  left: number;
  right: number;
  height: number;
  minimumPrice: number;
  maximumPrice: number;
  valueUsd: Rational;
  levelIds: string[];
  contributions: LiquidityContribution[];
};

export type LiquidityHover = {
  minimumPrice: number;
  maximumPrice: number;
  valueUsd: Rational;
  contributions: LiquidityContribution[];
};

class LiquidityProfileView implements IPrimitivePaneView {
  constructor(private readonly source: LiquidityProfilePrimitive) {}

  zOrder(): "top" {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        const series = this.source.series;
        if (!series) return;

        target.useBitmapCoordinateSpace(
          ({
            context,
            bitmapSize,
            horizontalPixelRatio,
            verticalPixelRatio,
          }) => {
            const rows = new Map<
              number,
              Omit<HitRow, "id" | "left" | "right" | "height">
            >();
            for (const level of this.source.levels) {
              const coordinate = series.priceToCoordinate(level.axisPrice);
              if (coordinate === null || !Number.isFinite(coordinate)) continue;
              const bucket = Math.round(coordinate);
              const row = rows.get(bucket);
              if (row) {
                row.valueUsd = addRational(row.valueUsd, level.valueUsd);
                row.minimumPrice = Math.min(row.minimumPrice, level.axisPrice);
                row.maximumPrice = Math.max(row.maximumPrice, level.axisPrice);
                row.levelIds.push(level.id);
                row.contributions.push(...level.contributions);
              } else {
                rows.set(bucket, {
                  y: bucket,
                  minimumPrice: level.axisPrice,
                  maximumPrice: level.axisPrice,
                  valueUsd: level.valueUsd,
                  levelIds: [level.id],
                  contributions: [...level.contributions],
                });
              }
            }

            const drawable = [...rows.values()];
            const maximum = drawable.reduce<Rational>(
              (largest, row) =>
                compareRational(row.valueUsd, largest) > 0
                  ? row.valueUsd
                  : largest,
              { numerator: 0n, denominator: 1n },
            );
            const maximumWidth = bitmapSize.width * 0.32;
            const right = bitmapSize.width;
            const hitRows: HitRow[] = [];

            context.save();
            for (const row of drawable) {
              const ratio = rationalRatio(row.valueUsd, maximum);
              const width = Math.max(
                2 * horizontalPixelRatio,
                maximumWidth * ratio,
              );
              const height = Math.max(3, 5 * verticalPixelRatio);
              const id = `liquidity-row:${row.y}`;
              context.fillStyle =
                this.source.highlightedId === id
                  ? "rgba(255, 209, 120, 0.72)"
                  : "rgba(62, 207, 142, 0.34)";
              context.fillRect(
                right - width,
                row.y * verticalPixelRatio - height / 2,
                width,
                height,
              );
              hitRows.push({
                ...row,
                id,
                left: (right - width) / horizontalPixelRatio,
                right: right / horizontalPixelRatio,
                height: height / verticalPixelRatio,
              });
            }
            context.restore();
            this.source.replaceHitRows(hitRows);
          },
        );
      },
    };
  }
}

export class LiquidityProfilePrimitive implements ISeriesPrimitive<Time> {
  series?: SeriesAttachedParameter<Time>["series"];
  readonly levels: readonly LiquidityLevel[];
  highlightedId?: string;
  private readonly views: readonly IPrimitivePaneView[];
  private hitRows: HitRow[] = [];
  private requestUpdate?: () => void;

  constructor(levels: readonly LiquidityLevel[]) {
    this.levels = levels;
    this.views = [new LiquidityProfileView(this)];
  }

  attached({ series, requestUpdate }: SeriesAttachedParameter<Time>): void {
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.series = undefined;
    this.requestUpdate = undefined;
    this.hitRows = [];
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const row = this.hitRows.find(
      (candidate) =>
        x >= candidate.left &&
        x <= candidate.right &&
        Math.abs(y - candidate.y) <= candidate.height / 2 + 2,
    );
    return row
      ? {
          externalId: row.id,
          cursorStyle: "crosshair",
          zOrder: "top",
          hitTestPriority: 1,
          distance: Math.abs(y - row.y),
        }
      : null;
  }

  hover(externalId: unknown): LiquidityHover | undefined {
    const row = this.hitRows.find(({ id }) => id === externalId);
    this.setHighlighted(row?.id);
    return row ? describeRow(row) : undefined;
  }

  hoverLevel(levelId: string | undefined): LiquidityHover | undefined {
    const row = levelId
      ? this.hitRows.find(({ levelIds }) => levelIds.includes(levelId))
      : undefined;
    this.setHighlighted(row?.id);
    return row ? describeRow(row) : undefined;
  }

  replaceHitRows(rows: HitRow[]): void {
    this.hitRows = rows;
  }

  private setHighlighted(id: string | undefined): void {
    if (this.highlightedId === id) return;
    this.highlightedId = id;
    this.requestUpdate?.();
  }
}

function describeRow(row: HitRow): LiquidityHover {
  return {
    minimumPrice: row.minimumPrice,
    maximumPrice: row.maximumPrice,
    valueUsd: row.valueUsd,
    contributions: [...row.contributions].sort((left, right) => {
      const value = compareRational(left.valueUsd, right.valueUsd);
      return value === 0 ? left.id.localeCompare(right.id) : -value;
    }),
  };
}

function rationalRatio(value: Rational, maximum: Rational): number {
  if (maximum.numerator <= 0n) return 0;
  const millionths =
    (value.numerator * maximum.denominator * 1_000_000n) /
    (value.denominator * maximum.numerator);
  return Number(millionths) / 1_000_000;
}
