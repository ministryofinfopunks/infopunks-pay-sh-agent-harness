import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stablecryptoTokenSearchCandidate } from "./mappings/stablecryptoTokenSearchCandidate";

const SAFE_PROOF_REFERENCE = "live-proofs/stablecrypto-token-search-candidate-unproven-2026-05-17.md";

function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

function render(now = new Date()): string {
  return [
    "# StableCrypto Token Search Candidate (Unproven)",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- provider_id: ${stablecryptoTokenSearchCandidate.provider_id}`,
    `- endpoint_url: ${stablecryptoTokenSearchCandidate.endpoint_url}`,
    `- method: ${stablecryptoTokenSearchCandidate.method}`,
    `- request_shape_example: ${JSON.stringify(stablecryptoTokenSearchCandidate.request_shape_example)}`,
    `- mapping_status: ${stablecryptoTokenSearchCandidate.mapping_status}`,
    `- execution_evidence_status: ${stablecryptoTokenSearchCandidate.execution_evidence_status}`,
    `- paid_execution_enabled: ${paidExecutionEnabled()}`,
    "- notes: This verifier is metadata-only by default and does not perform paid execution.",
    "No benchmark readiness claim.",
    "No winner claim.",
  ].join("\n");
}

export async function verifyStablecryptoTokenSearchCandidate(now = new Date()): Promise<string> {
  const proofPath = path.resolve(process.cwd(), SAFE_PROOF_REFERENCE);
  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${render(now)}\n`, "utf8");
  return proofPath;
}

if (require.main === module) {
  verifyStablecryptoTokenSearchCandidate()
    .then((proofPath) => {
      console.log(`Candidate proof written: ${path.relative(process.cwd(), proofPath)}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
