import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";

export type LiquidityLevel = {
  price: number;
  weight: number;
};

class LiquidityProfileView implements IPrimitivePaneView {
  constructor(
    private readonly source: LiquidityProfilePrimitive,
    private readonly levels: readonly LiquidityLevel[],
  ) {}

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
            const maxWeight = Math.max(
              ...this.levels.map(({ weight }) => weight),
              1,
            );
            const maximumWidth = bitmapSize.width * 0.28;
            const right = bitmapSize.width;

            context.save();
            context.fillStyle = "rgba(62, 207, 142, 0.28)";

            for (const { price, weight } of this.levels) {
              const coordinate = series.priceToCoordinate(price);
              if (coordinate === null) continue;

              const y = coordinate * verticalPixelRatio;
              const width = Math.max(
                2 * horizontalPixelRatio,
                maximumWidth * (weight / maxWeight),
              );
              const height = Math.max(3, 5 * verticalPixelRatio);
              context.fillRect(right - width, y - height / 2, width, height);
            }

            context.restore();
          },
        );
      },
    };
  }
}

export class LiquidityProfilePrimitive implements ISeriesPrimitive<Time> {
  series?: SeriesAttachedParameter<Time>["series"];
  private readonly views: readonly IPrimitivePaneView[];

  constructor(levels: readonly LiquidityLevel[]) {
    this.views = [new LiquidityProfileView(this, levels)];
  }

  attached({ series }: SeriesAttachedParameter<Time>): void {
    this.series = series;
  }

  detached(): void {
    this.series = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
