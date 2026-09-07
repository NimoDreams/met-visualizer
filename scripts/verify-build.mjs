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
  "/Users/",
  "/home/runner/work/",
  "/private/tmp/",
  "/private/var/",
  "C:\\Users\\",
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

const requiredDocumentPolicies = [
  `content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'self'; style-src-elem 'self' 'sha256-3pRED1tOXas1FXFoPb9TGCjmYe9XQsmO9OV23khV2nY='; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src https:; worker-src 'self'; frame-src 'none'; manifest-src 'self'; media-src 'none'"`,
  'name="referrer" content="no-referrer"',
];
for (const policy of requiredDocumentPolicies) {
  if (!index.includes(policy)) {
    throw new Error(`Production index is missing document policy: ${policy}`);
  }
}

console.log(
  `Verified ${files.length} production files: project base, document policies, no source maps, no credential, local-path, or prohibited-package markers.`,
);
