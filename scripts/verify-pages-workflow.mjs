import { readFile } from "node:fs/promises";

const workflowUrl = new URL("../.github/workflows/pages.yml", import.meta.url);
const nodeVersionUrl = new URL("../.nvmrc", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);
const lockfileUrl = new URL("../package-lock.json", import.meta.url);

export const expectedActionRefs = new Map([
  ["actions/checkout", "11d5960a326750d5838078e36cf38b85af677262"],
  ["actions/setup-node", "49933ea5288caeca8642d1e84afbd3f7d6820020"],
  ["actions/upload-pages-artifact", "7b1f4a764d45c48632c6b24a0339c27f5614fb0b"],
  ["actions/configure-pages", "983d7736d9b0ae728b81ab479565c72886d7745b"],
  ["actions/deploy-pages", "d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e"],
]);

const expectedCommands = [
  "npm ci",
  "npm run verify:pages-workflow",
  "npm run format:check",
  "npm run lint",
  "npm run typecheck",
  "npm run test",
  "npx playwright install --with-deps chromium firefox webkit",
  "npm run test:browser",
  "npm run test:browser:touch",
  "npm run build",
  "npm run verify:artifact",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Pages workflow verification failed: ${message}`);
  }
}

function extractBlock(source, key, indentation) {
  const lines = source.split(/\r?\n/u);
  const prefix = `${" ".repeat(indentation)}${key}:`;
  const start = lines.findIndex((line) => line === prefix);
  assert(start >= 0, `missing ${key} block at indentation ${indentation}`);

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() !== "") {
      const leadingSpaces = line.length - line.trimStart().length;
      if (leadingSpaces <= indentation) {
        break;
      }
    }
    end += 1;
  }

  return lines
    .slice(start + 1, end)
    .join("\n")
    .trimEnd();
}

function actionRefs(source) {
  return [...source.matchAll(/^\s+uses:\s+([^@\s]+)@([^\s#]+).*$/gmu)].map(
    ([, action, ref]) => ({ action, ref }),
  );
}

function runCommands(source) {
  return [...source.matchAll(/^\s+run:\s+(.+)$/gmu)].map(([, command]) =>
    command.trim(),
  );
}

function keysAtIndentation(source, indentation) {
  const pattern = new RegExp(
    `^ {${indentation}}([a-z][a-z0-9_-]*):(?:\\s.*)?$`,
    "gimu",
  );
  return [...source.matchAll(pattern)].map(([, key]) => key);
}

export function verifyPagesWorkflow({
  workflow,
  nodeVersion,
  packageManifest,
  lockfile,
}) {
  assert(
    JSON.stringify(keysAtIndentation(workflow, 0)) ===
      JSON.stringify(["name", "on", "permissions", "concurrency", "jobs"]),
    "top-level workflow keys must match the reviewed configuration",
  );
  const onBlock = extractBlock(workflow, "on", 0);
  assert(
    onBlock === "  push:\n    branches:\n      - main\n  workflow_dispatch:",
    "triggers must be limited to pushes to main and deliberate manual dispatch",
  );
  assert(
    /^permissions: \{\}$/mu.test(workflow),
    "top-level permissions must default to none",
  );

  const concurrency = extractBlock(workflow, "concurrency", 0);
  assert(
    concurrency === "  group: pages\n  cancel-in-progress: false",
    "Pages runs must use one non-cancelling concurrency group",
  );

  const jobs = extractBlock(workflow, "jobs", 0);
  const jobNames = [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gmu)].map(
    ([, name]) => name,
  );
  assert(
    JSON.stringify(jobNames) === JSON.stringify(["build", "deploy"]),
    "only build and deploy jobs are allowed",
  );

  const build = extractBlock(workflow, "build", 2);
  const deploy = extractBlock(workflow, "deploy", 2);
  assert(
    JSON.stringify(keysAtIndentation(build, 4)) ===
      JSON.stringify([
        "if",
        "runs-on",
        "timeout-minutes",
        "permissions",
        "steps",
      ]),
    "build job keys must match the reviewed configuration",
  );
  assert(
    JSON.stringify(keysAtIndentation(deploy, 4)) ===
      JSON.stringify([
        "if",
        "needs",
        "runs-on",
        "timeout-minutes",
        "permissions",
        "environment",
        "steps",
      ]),
    "deploy job keys must match the reviewed configuration",
  );
  assert(
    build.includes("    if: github.ref == 'refs/heads/main'"),
    "build must reject manual dispatches from non-main refs",
  );
  assert(
    deploy.includes("    if: github.ref == 'refs/heads/main'"),
    "deploy must reject manual dispatches from non-main refs",
  );

  const buildPermissions = extractBlock(build, "permissions", 4);
  assert(
    buildPermissions === "      contents: read",
    "build may receive only contents: read",
  );
  const deployPermissions = extractBlock(deploy, "permissions", 4);
  assert(
    deployPermissions === "      pages: write\n      id-token: write",
    "deploy must receive only pages: write and id-token: write",
  );
  const deploymentEnvironment = extractBlock(deploy, "environment", 4);
  assert(
    deploymentEnvironment ===
      "      name: github-pages\n      url: ${{ steps.deployment.outputs.page_url }}",
    "deploy must use only the github-pages environment and deployment URL",
  );
  assert(
    deploy.includes("    needs: build"),
    "deploy must wait for the verified build artifact",
  );
  assert(
    build.includes("    timeout-minutes: 30") &&
      deploy.includes("    timeout-minutes: 15"),
    "build and deploy jobs must have reviewed timeout limits",
  );

  const refs = actionRefs(workflow);
  assert(
    refs.length === expectedActionRefs.size,
    "workflow must use each approved official action exactly once",
  );
  for (const { action, ref } of refs) {
    const expected = expectedActionRefs.get(action);
    assert(expected !== undefined, `unapproved action ${action}`);
    assert(
      /^[0-9a-f]{40}$/u.test(ref),
      `${action} is not pinned to a full SHA`,
    );
    assert(ref === expected, `${action} does not use its reviewed release SHA`);
  }
  for (const action of expectedActionRefs.keys()) {
    assert(
      refs.filter((entry) => entry.action === action).length === 1,
      `${action} must appear exactly once`,
    );
  }
  assert(
    build.includes("actions/upload-pages-artifact@"),
    "build must upload the verified artifact",
  );
  assert(
    !build.includes("actions/configure-pages@") &&
      !build.includes("actions/deploy-pages@"),
    "build must not receive Pages configuration or deployment actions",
  );
  assert(
    deploy.includes("actions/configure-pages@") &&
      deploy.includes("actions/deploy-pages@"),
    "deploy must own Pages configuration and deployment",
  );
  assert(
    deploy.includes("          enablement: false") &&
      !workflow.includes("enablement: true"),
    "the workflow must not enable GitHub Pages",
  );

  assert(
    build.includes("          path: ./dist"),
    "the Pages upload path must be exactly ./dist",
  );
  assert(
    [...build.matchAll(/^ {10}path:/gmu)].length === 1,
    "the Pages upload action must have one path input",
  );
  assert(
    build.includes("          retention-days: 1"),
    "the Pages artifact must expire after one day",
  );
  assert(
    build.includes("          persist-credentials: false"),
    "checkout must not persist its token in the worktree",
  );
  assert(
    [...build.matchAll(/^ {10}persist-credentials:/gmu)].length === 1 &&
      [...build.matchAll(/^ {10}retention-days:/gmu)].length === 1,
    "security-sensitive checkout and artifact inputs must appear once",
  );
  assert(
    [...deploy.matchAll(/^ {10}enablement:/gmu)].length === 1,
    "Pages enablement control must appear once",
  );
  assert(
    !build.includes("path: .\n") && !build.includes("path: ./\n"),
    "the workflow must not upload the repository root",
  );

  const commands = runCommands(workflow);
  assert(
    JSON.stringify(commands) === JSON.stringify(expectedCommands),
    "build commands must match the reviewed install and verification gates",
  );

  const forbiddenWorkflowText = [
    "secrets.",
    "env:",
    "VITE_",
    "MET_VISUALIZER_RPC_URL",
    "/Users/",
    "/home/runner/work/",
    "/private/tmp/",
    "/private/var/",
    "C:\\Users\\",
    "pull_request:",
    "schedule:",
    "continue-on-error:",
    "enablement: true",
    "persist-credentials: true",
  ];
  for (const value of forbiddenWorkflowText) {
    assert(
      !workflow.includes(value),
      `workflow contains forbidden text: ${value}`,
    );
  }

  const parsedPackage = JSON.parse(packageManifest);
  const parsedLockfile = JSON.parse(lockfile);
  assert(nodeVersion.trim() === "24.20.0", ".nvmrc must pin Node.js 24.20.0");
  assert(
    parsedPackage.packageManager === "npm@11.19.0",
    "package.json must pin npm 11.19.0",
  );
  assert(
    parsedLockfile.lockfileVersion === 3,
    "package-lock.json must remain the npm lockfile used by npm ci",
  );
}

async function verifyCheckedInWorkflow() {
  const [workflow, nodeVersion, packageManifest, lockfile] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(nodeVersionUrl, "utf8"),
    readFile(packageUrl, "utf8"),
    readFile(lockfileUrl, "utf8"),
  ]);

  verifyPagesWorkflow({
    workflow,
    nodeVersion,
    packageManifest,
    lockfile,
  });

  console.log(
    "Verified main-only Pages workflow triggers, least-privilege jobs, pinned official actions, dist-only artifact, and deployment gates.",
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  await verifyCheckedInWorkflow();
}
