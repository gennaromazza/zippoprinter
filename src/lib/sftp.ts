import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { decryptSecret } from "./export-crypto";
import type { Photographer, SftpAuthType } from "./types";

export interface ResolvedSftpConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  authType: SftpAuthType;
  password?: string;
  privateKey?: string;
}

function normalizeRemotePath(remotePath: string) {
  const normalized = remotePath.replace(/\\/g, "/").trim();
  if (!normalized) {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isValuePresent(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function resolveSftpConfigFromPhotographer(photographer: Photographer): ResolvedSftpConfig | null {
  const authType = (photographer.export_sftp_auth_type || "password") as SftpAuthType;
  const enabled = Boolean(photographer.export_sftp_enabled);
  const host = photographer.export_sftp_host?.trim() || "";
  const port = photographer.export_sftp_port || 22;
  const username = photographer.export_sftp_username?.trim() || "";
  const remotePath = normalizeRemotePath(photographer.export_sftp_remote_path || "/");

  if (!enabled || !host || !username) {
    return null;
  }

  if (authType === "private_key") {
    const privateKey = decryptSecret(photographer.export_sftp_private_key_encrypted || "");
    if (!isValuePresent(privateKey)) {
      return null;
    }
    return { enabled, host, port, username, remotePath, authType, privateKey };
  }

  const password = decryptSecret(photographer.export_sftp_password_encrypted || "");
  if (!isValuePresent(password)) {
    return null;
  }

  return { enabled, host, port, username, remotePath, authType, password };
}

function getConnectionPayload(config: ResolvedSftpConfig) {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.authType === "password" ? config.password : undefined,
    privateKey: config.authType === "private_key" ? config.privateKey : undefined,
    readyTimeout: 15000,
  };
}

export async function testSftpConnection(config: ResolvedSftpConfig) {
  const client = new SftpClient();

  try {
    await client.connect(getConnectionPayload(config));

    const exists = await client.exists(config.remotePath);
    if (!exists) {
      await client.mkdir(config.remotePath, true);
    }

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connessione SFTP non riuscita.";
    return { ok: false as const, error: message };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function withSftpClient<T>(
  config: ResolvedSftpConfig,
  fn: (client: SftpClient) => Promise<T>
) {
  const client = new SftpClient();
  try {
    await client.connect(getConnectionPayload(config));
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function uploadBuffer(
  client: SftpClient,
  basePath: string,
  relativePath: string,
  buffer: Buffer
) {
  const targetPath = path.posix.join(basePath, relativePath);
  const targetDir = path.posix.dirname(targetPath);
  const exists = await client.exists(targetDir);
  if (!exists) {
    await client.mkdir(targetDir, true);
  }
  await client.put(buffer, targetPath);
  return targetPath;
}
