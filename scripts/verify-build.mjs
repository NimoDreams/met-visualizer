import { readdir, readFile } from "node:fs/promises";

const root = new URL("../dist/", import.meta.url);
const forbidden = [
  "browser-secret-marker",
  "MET_VISUALIZER_RPC_URL",
  "VITE_RPC_URL",
  "@meteora-ag/dlmm",
  "@solana/wallet-adapter",
  "@solana/signers",
  "@solana/transactions",
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const target = new URL(entry.name, directory);
        return entry.isDirectory()
          ? filesIn(new URL(`${entry.name}/`, directory))
          : target;
      }),
    )
  ).flat();
}

const files = await filesIn(root);
const sourceMaps = files.filter((file) => file.pathname.endsWith(".map"));

if (sourceMaps.length > 0) {
  throw new Error("Production build contains source maps.");
}

for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const value of forbidden) {
    if (content.includes(value)) {
      throw new Error(
        `Production artifact contains forbidden marker: ${value}`,
      );
    }
  }
}

const index = await readFile(new URL("index.html", root), "utf8");
if (!index.includes("/met-visualizer/assets/")) {
  throw new Error(
    "Production index does not use the GitHub Pages project base.",
  );
}

console.log(
  `Verified ${files.length} production files: project base, no source maps, no credential or prohibited-package markers.`,
);
