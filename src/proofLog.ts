import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ProofLog } from "./types";

function safeFileSuffix(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function saveProofLog(kind: string, proof: ProofLog): Promise<string> {
  const PROOFS_DIR = path.resolve(process.cwd(), "proofs");
  await mkdir(PROOFS_DIR, { recursive: true });

  const timestamp = proof.timestamp.replace(/[:.]/g, "-");
  const fileName = `${timestamp}-${safeFileSuffix(kind)}-${randomUUID()}.json`;
  const outputPath = path.join(PROOFS_DIR, fileName);

  await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return outputPath;
}
