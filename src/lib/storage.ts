import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "ssh2";
import SftpClient from "ssh2-sftp-client";
import { prisma } from "@/lib/prisma";

const localUploadDir = path.join(process.cwd(), "public", "uploads");
const activeStorageSettingKey = "activeStorageTarget";

export type StorageTargetKey = "oracle" | "contabo";

export type StorageTargetConfig = {
  key: StorageTargetKey;
  label: string;
  host?: string;
  port: number;
  username?: string;
  privateKey?: string;
  uploadPath?: string;
  publicBaseUrl?: string;
};

export type StorageDiskStatus = {
  ok: boolean;
  total?: string;
  used?: string;
  available?: string;
  usePercent?: string;
  uploadSize?: string;
  error?: string;
};

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

export function getStorageTargets(): StorageTargetConfig[] {
  return [
    {
      key: "oracle",
      label: "Oracle VPS",
      host: process.env.VPS_SFTP_HOST,
      port: Number(process.env.VPS_SFTP_PORT ?? 22),
      username: process.env.VPS_SFTP_USER,
      privateKey: process.env.VPS_SFTP_PRIVATE_KEY,
      uploadPath: process.env.VPS_UPLOAD_PATH,
      publicBaseUrl: process.env.PUBLIC_UPLOAD_BASE_URL,
    },
    {
      key: "contabo",
      label: "Contabo VPS",
      host: process.env.CONTABO_SFTP_HOST,
      port: Number(process.env.CONTABO_SFTP_PORT ?? 22),
      username: process.env.CONTABO_SFTP_USER,
      privateKey: process.env.CONTABO_SFTP_PRIVATE_KEY,
      uploadPath: process.env.CONTABO_UPLOAD_PATH,
      publicBaseUrl: process.env.CONTABO_PUBLIC_UPLOAD_BASE_URL,
    },
  ];
}

export function getStorageTarget(key: string) {
  return getStorageTargets().find((target) => target.key === key);
}

// URLs http:// (VPS por IP, sem TLS) sao servidas via proxy same-origin para
// evitar Mixed Content em paginas HTTPS. URLs locais/https sao mantidas.
export function toDisplayUrl(url: string) {
  if (url.startsWith("http://")) {
    return `/api/photo?src=${encodeURIComponent(url)}`;
  }
  return url;
}

export function isRemoteStorageConfigured(target: StorageTargetConfig) {
  return Boolean(
    target.host &&
      target.username &&
      target.privateKey &&
      target.uploadPath &&
      target.publicBaseUrl,
  );
}

export async function getActiveStorageTargetKey(): Promise<StorageTargetKey> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: activeStorageSettingKey },
  });

  return setting?.value === "contabo" ? "contabo" : "oracle";
}

export async function setActiveStorageTargetKey(targetKey: StorageTargetKey) {
  await prisma.appSetting.upsert({
    where: { key: activeStorageSettingKey },
    create: { key: activeStorageSettingKey, value: targetKey },
    update: { value: targetKey },
  });
}

async function savePhotoToVps(
  target: StorageTargetConfig,
  fileName: string,
  bytes: Buffer,
) {
  if (!isRemoteStorageConfigured(target)) {
    throw new Error(`${target.label} nao esta configurada para upload.`);
  }

  const sftp = new SftpClient();
  const remoteDir = target.uploadPath as string;
  const remotePath = path.posix.join(remoteDir, fileName);

  await sftp.connect({
    host: target.host,
    port: target.port,
    username: target.username,
    privateKey: normalizePrivateKey(target.privateKey as string),
  });

  try {
    await sftp.mkdir(remoteDir, true);
    await sftp.put(bytes, remotePath);
    await sftp.chmod(remotePath, 0o644);
  } finally {
    await sftp.end();
  }

  return {
    fileName,
    storageTarget: target.key,
    url: `${target.publicBaseUrl?.replace(/\/$/, "")}/${fileName}`,
  };
}

async function savePhotoLocally(fileName: string, bytes: Buffer) {
  await mkdir(localUploadDir, { recursive: true });
  await writeFile(path.join(localUploadDir, fileName), bytes);

  return {
    fileName,
    storageTarget: "local",
    url: `/uploads/${fileName}`,
  };
}

export async function savePhoto(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name) || ".jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const activeTarget = getStorageTarget(await getActiveStorageTargetKey());

  if (activeTarget && isRemoteStorageConfigured(activeTarget)) {
    return savePhotoToVps(activeTarget, fileName, bytes);
  }

  return savePhotoLocally(fileName, bytes);
}

export async function getStorageDiskStatus(
  target: StorageTargetConfig,
): Promise<StorageDiskStatus> {
  if (!isRemoteStorageConfigured(target)) {
    return { ok: false, error: "Variaveis de ambiente incompletas." };
  }

  const command = [
    `mkdir -p ${shellQuote(target.uploadPath as string)}`,
    `df -h ${shellQuote(target.uploadPath as string)} | awk 'NR==2 {print $2 "|" $3 "|" $4 "|" $5}'`,
    `du -sh ${shellQuote(target.uploadPath as string)} 2>/dev/null | awk '{print $1}'`,
  ].join(" && ");

  try {
    const output = await runSshCommand(target, command);
    const [diskLine, uploadSizeLine] = output.trim().split(/\r?\n/);
    const [total, used, available, usePercent] = diskLine.split("|");

    return {
      ok: true,
      total,
      used,
      available,
      usePercent,
      uploadSize: uploadSizeLine || "0",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao consultar VPS.",
    };
  }
}

function runSshCommand(target: StorageTargetConfig, command: string) {
  return new Promise<string>((resolve, reject) => {
    const client = new Client();
    let stdout = "";
    let stderr = "";

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          stream
            .on("close", (code: number) => {
              client.end();
              if (code === 0) {
                resolve(stdout);
              } else {
                reject(new Error(stderr.trim() || `SSH saiu com codigo ${code}`));
              }
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", reject)
      .connect({
        host: target.host,
        port: target.port,
        username: target.username,
        privateKey: normalizePrivateKey(target.privateKey as string),
        readyTimeout: 8000,
      });
  });
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
