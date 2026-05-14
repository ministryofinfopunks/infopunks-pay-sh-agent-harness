import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveProofLog } from "./proofLog";
import { ProofLog } from "./types";

function makeProof(timestamp: string): ProofLog {
  return {
    timestamp,
    userIntent: "test",
    candidateProviders: [],
    selectedProvider: null,
    rejectedProviders: [],
    radarSignalsUsed: [],
    routingPolicy: [],
    simulatedOrLiveResult: "skipped",
    latencyMs: 0,
    success: false,
    radarApiUsed: false,
  };
}

test("saveProofLog does not collide for repeated timestamp and kind", async () => {
  const originalCwd = process.cwd();
  const tempDir = await mkdtemp(path.join(tmpdir(), "infopunks-proof-test-"));

  try {
    process.chdir(tempDir);
    const timestamp = "2026-05-14T00:00:00.000Z";
    const firstPath = await saveProofLog("same-kind", makeProof(timestamp));
    const secondPath = await saveProofLog("same-kind", makeProof(timestamp));

    assert.notEqual(firstPath, secondPath);
    assert.equal((await stat(firstPath)).isFile(), true);
    assert.equal((await stat(secondPath)).isFile(), true);
  } finally {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
