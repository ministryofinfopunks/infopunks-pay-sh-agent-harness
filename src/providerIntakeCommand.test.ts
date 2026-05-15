import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildVerifyMappingCommand,
  parseIntakeJson,
  readIntakeFile,
  shellQuote,
  sideEffectWarnings,
} from "./providerIntakeCommand";

const validIntake = {
  provider: {
    providerId: "paysponge/perplexity",
    normalizedProviderId: "paysponge-perplexity",
    name: "PaySponge Perplexity",
    category: "ai_ml",
    serviceUrl: "https://pplx.x402.paysponge.com",
    source: "catalog",
    notes: "Safe research route",
  },
  route: {
    endpointMappingId: "paysponge-perplexity-search",
    label: "PaySponge Perplexity Search",
    endpointUrl: "https://pplx.x402.paysponge.com/search",
    method: "POST",
    body: { query: "latest Solana agent payments", max_results: 1 },
    outputShape: "research_answer",
    capabilities: ["research", "web_search"],
  },
  safety: {
    sideEffectLevel: "read_only",
    requiresOwnPhoneNumber: false,
    requiresSecrets: false,
    safeForDefaultExecution: false,
    notes: "Read-only query",
  },
  verification: {
    unpaid402Observed: false,
    payCliSuccess: false,
    parsedJsonAvailable: false,
    applicationSuccess: false,
    recommendedStatus: "candidate_pending",
    evidencePath: "",
    verifiedAt: "",
  },
  promotionRules: ["pay CLI exitCode must be 0"],
};

test("reads JSON intake", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "intake-test-"));
  const filePath = path.join(dir, "intake.json");
  await writeFile(filePath, JSON.stringify(validIntake), "utf8");

  const intake = await readIntakeFile(filePath);
  assert.equal(intake.provider.providerId, "paysponge/perplexity");
  assert.equal(intake.route.outputShape, "research_answer");
});

test("generates VERIFY command", () => {
  const command = buildVerifyMappingCommand(parseIntakeJson(JSON.stringify(validIntake)));
  assert.match(command, /PAYSH_EXECUTION_MODE=pay_cli/);
  assert.match(command, /LIVE_PAYSH_EXECUTION=true/);
  assert.match(command, /VERIFY_PROVIDER_ID='paysponge\/perplexity'/);
  assert.match(command, /VERIFY_OUTPUT_SHAPE='research_answer'/);
  assert.match(command, /npm run verify:mapping/);
});

test("includes headers when provided", () => {
  const withHeaders = {
    ...validIntake,
    route: {
      ...validIntake.route,
      headers: {
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
    },
  };
  const command = buildVerifyMappingCommand(parseIntakeJson(JSON.stringify(withHeaders)));
  assert.match(command, /VERIFY_HEADERS_JSON='\{"X-Goog-FieldMask":"places\.id,places\.displayName"\}'/);
});

test("shell-quotes body safely", () => {
  const quoted = shellQuote(`{"query":"O'Reilly"}`);
  assert.equal(quoted, `'{"query":"O'"'"'Reilly"}'`);
});

test("rejects missing required fields", () => {
  const invalid = {
    ...validIntake,
    route: {
      ...validIntake.route,
      endpointUrl: "",
    },
  };

  assert.throws(
    () => parseIntakeJson(JSON.stringify(invalid)),
    /Missing required intake fields: route.endpointUrl/,
  );
});

test("marks side-effectful route warning", () => {
  const sideEffectful = {
    ...validIntake,
    safety: {
      ...validIntake.safety,
      sideEffectLevel: "sends_message",
    },
  };
  const warnings = sideEffectWarnings(parseIntakeJson(JSON.stringify(sideEffectful)));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /sideEffectLevel=sends_message/);
});
