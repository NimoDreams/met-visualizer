// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { verifyPagesWorkflow } from "../../scripts/verify-pages-workflow.mjs";

const root = new URL("../../", import.meta.url);

async function fixture() {
  const [workflow, nodeVersion, packageManifest, lockfile] = await Promise.all([
    readFile(new URL(".github/workflows/pages.yml", root), "utf8"),
    readFile(new URL(".nvmrc", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("package-lock.json", root), "utf8"),
  ]);

  return { workflow, nodeVersion, packageManifest, lockfile };
}

describe("Pages workflow policy", () => {
  it("accepts the checked-in main-only workflow", async () => {
    const input = await fixture();

    expect(() => verifyPagesWorkflow(input)).not.toThrow();
  });

  it("rejects a dev push trigger", async () => {
    const input = await fixture();
    input.workflow = input.workflow.replace("      - main", "      - dev");

    expect(() => verifyPagesWorkflow(input)).toThrow(/triggers/u);
  });

  it("rejects Pages write access in the build job", async () => {
    const input = await fixture();
    input.workflow = input.workflow.replace(
      "      contents: read",
      "      contents: read\n      pages: write",
    );

    expect(() => verifyPagesWorkflow(input)).toThrow(/build may receive only/u);
  });

  it("rejects an upload broader than dist", async () => {
    const input = await fixture();
    input.workflow = input.workflow.replace("path: ./dist", "path: .");

    expect(() => verifyPagesWorkflow(input)).toThrow(/upload path/u);
  });

  it("rejects a mutable action tag", async () => {
    const input = await fixture();
    input.workflow = input.workflow.replace(
      "actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e",
      "actions/deploy-pages@v4",
    );

    expect(() => verifyPagesWorkflow(input)).toThrow(/full SHA/u);
  });

  it("rejects workflow environment variables", async () => {
    const input = await fixture();
    input.workflow = input.workflow.replace(
      "permissions: {}",
      "permissions: {}\nenv:\n  EXAMPLE: value",
    );

    expect(() => verifyPagesWorkflow(input)).toThrow(
      /top-level workflow keys/u,
    );
  });

  it("rejects a duplicate top-level permission override", async () => {
    const input = await fixture();
    input.workflow += "\npermissions: write-all\n";

    expect(() => verifyPagesWorkflow(input)).toThrow(
      /top-level workflow keys/u,
    );
  });
});
