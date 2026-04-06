import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const EXPECTED_PROJECT_ID = "prj_xOeXEsDrfOETjY3yqQkd4mWy9G0S";
const EXPECTED_ORG_ID = "team_ZsTOatWoVvn2ObU3m2ZbxY00";
const EXPECTED_PROJECT_NAME = "zippoprinter";
const REQUIRED_ALIAS = "zippoprinter.vercel.app";

const CHECK_ONLY = process.argv.includes("--check-only");
const SKIP_BUILD = process.argv.includes("--skip-build");
const projectRoot = process.cwd();

loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env.vercel.local"));
loadEnvFile(path.join(projectRoot, "vercel-env.txt"));

const token = (process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || "").trim();
if (!token) {
  fail(
    "Missing VERCEL_API_TOKEN / VERCEL_TOKEN. Add it in .env.vercel.local or export it before running deploy."
  );
}

const linkedProject = readLinkedProjectConfig();
assertLinkedProject(linkedProject);

const apiBase = "https://api.vercel.com";

await verifyRemoteProject(linkedProject.projectId);
await verifyRequiredAliasDomain(linkedProject.projectId);

if (CHECK_ONLY) {
  info("Check-only mode completed. Deploy target is valid.");
  process.exit(0);
}

if (!SKIP_BUILD) {
  runCommand("npm", ["run", "build"], {
    failMessage: "Local build failed. Deploy aborted.",
  });
}

runCommand(getNpxCommand(), ["vercel", "--prod", "--yes", "--scope", EXPECTED_ORG_ID], {
  failMessage: "Vercel production deploy failed.",
});

runCommand(
  getNpxCommand(),
  ["vercel", "inspect", REQUIRED_ALIAS, "--scope", EXPECTED_ORG_ID],
  {
    failMessage: `Post-deploy verification failed for alias ${REQUIRED_ALIAS}.`,
  }
);

info(`Deploy completed and verified on https://${REQUIRED_ALIAS}`);

function readLinkedProjectConfig() {
  const projectJsonPath = path.join(projectRoot, ".vercel", "project.json");
  if (!fs.existsSync(projectJsonPath)) {
    fail("Missing .vercel/project.json. Run `vercel link` first on the correct project.");
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"));
    return {
      projectId: parsed.projectId,
      orgId: parsed.orgId,
      projectName: parsed.projectName,
    };
  } catch (error) {
    fail(
      `Cannot parse .vercel/project.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

function assertLinkedProject(project) {
  if (project.projectId !== EXPECTED_PROJECT_ID) {
    fail(
      `Linked projectId mismatch. Expected ${EXPECTED_PROJECT_ID}, got ${project.projectId || "empty"}.`
    );
  }
  if (project.orgId !== EXPECTED_ORG_ID) {
    fail(
      `Linked orgId mismatch. Expected ${EXPECTED_ORG_ID}, got ${project.orgId || "empty"}.`
    );
  }
  if (project.projectName !== EXPECTED_PROJECT_NAME) {
    fail(
      `Linked projectName mismatch. Expected ${EXPECTED_PROJECT_NAME}, got ${
        project.projectName || "empty"
      }.`
    );
  }

  info(
    `Linked project verified: ${project.projectName} (${project.projectId}) in ${project.orgId}.`
  );
}

async function verifyRemoteProject(projectId) {
  const response = await fetchWithTeam(`/v9/projects/${projectId}`);
  if (!response.ok) {
    const body = await safeJson(response);
    fail(
      `Cannot access Vercel project ${projectId}. HTTP ${response.status}. ${
        body?.error?.message || "No extra details"
      }`
    );
  }

  const body = await safeJson(response);
  if (body?.name !== EXPECTED_PROJECT_NAME) {
    fail(
      `Remote project name mismatch. Expected ${EXPECTED_PROJECT_NAME}, got ${
        body?.name || "empty"
      }.`
    );
  }

  info(`Remote project verified via API: ${body.name}`);
}

async function verifyRequiredAliasDomain(projectId) {
  const response = await fetchWithTeam(`/v9/projects/${projectId}/domains`);
  if (!response.ok) {
    const body = await safeJson(response);
    fail(
      `Cannot read project domains. HTTP ${response.status}. ${
        body?.error?.message || "No extra details"
      }`
    );
  }

  const body = await safeJson(response);
  const domains = Array.isArray(body?.domains) ? body.domains : [];
  const names = domains.map((domain) => String(domain?.name || ""));
  if (!names.includes(REQUIRED_ALIAS)) {
    fail(
      `Required alias ${REQUIRED_ALIAS} is not attached to this Vercel project. Attached domains: ${names.join(
        ", "
      )}`
    );
  }

  info(`Domain guard verified: ${REQUIRED_ALIAS} is attached to the target project.`);
}

async function fetchWithTeam(pathname) {
  const separator = pathname.includes("?") ? "&" : "?";
  const url = `${apiBase}${pathname}${separator}teamId=${encodeURIComponent(EXPECTED_ORG_ID)}`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function runCommand(command, args, options) {
  const resolvedCommand = command === "npm" ? getNpmCommand() : command;
  const safeArgs = sanitizeArgs(args);
  info(`Running: ${command} ${safeArgs.join(" ")}`);
  const childOptions = {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VERCEL_TOKEN: token,
      VERCEL_ORG_ID: EXPECTED_ORG_ID,
      VERCEL_PROJECT_ID: EXPECTED_PROJECT_ID,
    },
  };
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", [resolvedCommand, ...args].map(escapeWindowsArg).join(" ")],
          childOptions
        )
      : spawnSync(resolvedCommand, args, childOptions);

  if (result.error) {
    fail(`${options.failMessage} ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${options.failMessage} Exit code: ${result.status}`);
  }
}

function getNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function sanitizeArgs(args) {
  const sanitized = [...args];
  for (let index = 0; index < sanitized.length; index += 1) {
    if (sanitized[index] === "--token" && index + 1 < sanitized.length) {
      sanitized[index + 1] = "***";
      index += 1;
    }
  }
  return sanitized;
}

function escapeWindowsArg(arg) {
  const value = String(arg);
  if (value.length === 0) {
    return '""';
  }

  const needsQuotes = /[\s^&|<>()]/.test(value);
  const escaped = value.replace(/"/g, '\\"');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function info(message) {
  console.log(`[deploy-safe] ${message}`);
}

function fail(message) {
  console.error(`[deploy-safe] ERROR: ${message}`);
  process.exit(1);
}
