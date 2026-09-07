import { isSolanaAddress } from "../domain/solanaAddress";
import { ProviderRequestError, requestJson } from "./http";

const METEORA_DATA_BASE = "https://dlmm.datapi.meteora.ag";
export const METEORA_METADATA_PAGE_SIZE = 20;

export type MeteoraPoolOrientation = "x" | "y";

export type MeteoraPoolMetadata = {
  address: string;
  name: string;
  tokenXMint: string;
  tokenYMint: string;
  tokenXSymbol?: string;
  tokenYSymbol?: string;
  tvlUsd: number;
  volume24hUsd: number;
  blacklisted: boolean;
  observedAt: number;
};

export type MeteoraPoolPage = {
  orientation: MeteoraPoolOrientation;
  currentPage: number;
  pageCount: number;
  pageSize: number;
  total: number;
  pools: MeteoraPoolMetadata[];
  exhausted: boolean;
  frontierTvlUsd?: number;
};

export type MeteoraMetadataErrorKind = "network" | "provider" | "shape";

export class MeteoraMetadataError extends Error {
  constructor(
    readonly kind: MeteoraMetadataErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MeteoraMetadataError";
  }
}

export interface MeteoraMetadataProvider {
  getPoolPage(
    mint: string,
    orientation: MeteoraPoolOrientation,
    page: number,
    signal?: AbortSignal,
  ): Promise<MeteoraPoolPage>;
}

export class PublicMeteoraMetadataProvider implements MeteoraMetadataProvider {
  async getPoolPage(
    mint: string,
    orientation: MeteoraPoolOrientation,
    page: number,
    signal?: AbortSignal,
  ): Promise<MeteoraPoolPage> {
    const query = new URLSearchParams({
      filter_by: `token_${orientation}=${mint}`,
      sort_by: "tvl:desc",
      page_size: String(METEORA_METADATA_PAGE_SIZE),
      page: String(page),
    });

    try {
      const response = await requestJson<unknown>(
        `${METEORA_DATA_BASE}/pools?${query.toString()}`,
        {
          provider: "Meteora metadata",
          signal,
          init: { headers: { Accept: "application/json" } },
        },
      );
      return parsePoolPage(response, mint, orientation, page);
    } catch (error) {
      if (error instanceof MeteoraMetadataError) throw error;
      if (error instanceof ProviderRequestError) {
        if (error.kind === "limit" || error.kind === "invalid-json") {
          throw new MeteoraMetadataError("shape", error.message);
        }
        throw new MeteoraMetadataError(
          error.status === undefined ? "network" : "provider",
          error.status === undefined
            ? "Meteora pool metadata could not be reached."
            : `Meteora pool metadata returned HTTP ${error.status}.`,
          error.status,
        );
      }
      throw error;
    }
  }
}

export const publicMeteoraMetadataProvider =
  new PublicMeteoraMetadataProvider();

function parsePoolPage(
  value: unknown,
  mint: string,
  orientation: MeteoraPoolOrientation,
  requestedPage: number,
): MeteoraPoolPage {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw shapeError("Pool page is missing its data list.");
  }
  const currentPage = requiredInteger(value.current_page, "current page", 1);
  const pageCount = requiredInteger(value.pages, "page count", 0);
  const pageSize = requiredInteger(value.page_size, "page size", 1);
  const total = requiredInteger(value.total, "total", 0);
  if (
    currentPage !== requestedPage ||
    pageSize !== METEORA_METADATA_PAGE_SIZE
  ) {
    throw shapeError("Pool page does not match the requested pagination.");
  }
  if (value.data.length > pageSize) {
    throw shapeError("Pool page exceeds its declared page size.");
  }
  validatePagination(
    currentPage,
    pageCount,
    pageSize,
    total,
    value.data.length,
  );

  const observedAt = Date.now();
  const pools = value.data.map((pool, index) =>
    parsePool(pool, mint, orientation, observedAt, index),
  );
  for (let index = 1; index < pools.length; index += 1) {
    if (pools[index]!.tvlUsd > pools[index - 1]!.tvlUsd) {
      throw shapeError("Pool page is not sorted by TVL descending.");
    }
  }
  const exhausted = pageCount === 0 || currentPage >= pageCount;

  return {
    orientation,
    currentPage,
    pageCount,
    pageSize,
    total,
    pools,
    exhausted,
    frontierTvlUsd: pools.at(-1)?.tvlUsd,
  };
}

function parsePool(
  value: unknown,
  mint: string,
  orientation: MeteoraPoolOrientation,
  observedAt: number,
  index: number,
): MeteoraPoolMetadata {
  if (
    !isRecord(value) ||
    !isRecord(value.token_x) ||
    !isRecord(value.token_y)
  ) {
    throw shapeError(`Pool row ${index + 1} has invalid token data.`);
  }
  const address = requiredAddress(value.address, "pool address");
  const tokenXMint = requiredAddress(value.token_x.address, "token X mint");
  const tokenYMint = requiredAddress(value.token_y.address, "token Y mint");
  const expectedMint = orientation === "x" ? tokenXMint : tokenYMint;
  if (expectedMint !== mint) {
    throw shapeError(
      `Pool row ${index + 1} does not match the requested token orientation.`,
    );
  }

  return {
    address,
    name: requiredString(value.name, "pool name"),
    tokenXMint,
    tokenYMint,
    tokenXSymbol: optionalString(value.token_x.symbol),
    tokenYSymbol: optionalString(value.token_y.symbol),
    tvlUsd: requiredNumber(value.tvl, "pool TVL"),
    volume24hUsd: isRecord(value.volume)
      ? requiredNumber(value.volume["24h"], "24-hour volume")
      : 0,
    blacklisted: value.is_blacklisted === true,
    observedAt,
  };
}

function validatePagination(
  currentPage: number,
  pageCount: number,
  pageSize: number,
  total: number,
  rowCount: number,
): void {
  if (total === 0) {
    if (
      currentPage !== 1 ||
      rowCount !== 0 ||
      (pageCount !== 0 && pageCount !== 1)
    ) {
      throw shapeError("Empty pagination metadata is inconsistent.");
    }
    return;
  }

  const expectedPageCount = Math.ceil(total / pageSize);
  if (pageCount !== expectedPageCount || currentPage > pageCount) {
    throw shapeError("Pool page count is inconsistent with its total.");
  }
  const expectedRows =
    currentPage < pageCount ? pageSize : total - pageSize * (pageCount - 1);
  if (rowCount !== expectedRows) {
    throw shapeError(
      currentPage < pageCount
        ? "Pool page appears truncated before its final page."
        : "Final pool page is inconsistent with its declared total.",
    );
  }
}

function requiredAddress(value: unknown, label: string): string {
  const address = requiredString(value, label);
  if (!isSolanaAddress(address)) throw shapeError(`Invalid ${label}.`);
  return address;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw shapeError(`Invalid ${label}.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw shapeError(`Invalid ${label}.`);
  return number;
}

function requiredInteger(
  value: unknown,
  label: string,
  minimum: number,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw shapeError(`Invalid ${label}.`);
  }
  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shapeError(message: string): MeteoraMetadataError {
  return new MeteoraMetadataError("shape", message);
}
