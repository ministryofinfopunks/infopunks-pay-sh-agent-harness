import test from "node:test";
import assert from "node:assert/strict";
import { expandFlowSelection, isDryRunMode, parseFlowArg } from "./agentLoopDemoHelpers";

test("parseFlowArg defaults to all", () => {
  assert.equal(parseFlowArg([]), "all");
});

test("parseFlowArg supports explicit flow", () => {
  assert.equal(parseFlowArg(["--flow=research"]), "research");
  assert.equal(parseFlowArg(["--flow", "market"]), "market");
});

test("parseFlowArg rejects unknown flow", () => {
  assert.throws(() => parseFlowArg(["--flow=unknown"]), /Unknown flow: unknown/);
});

test("isDryRunMode tracks LIVE_PAYSH_EXECUTION", () => {
  assert.equal(isDryRunMode({ LIVE_PAYSH_EXECUTION: "true" }), false);
  assert.equal(isDryRunMode({ LIVE_PAYSH_EXECUTION: "false" }), true);
  assert.equal(isDryRunMode({}), true);
});

test("expandFlowSelection expands all to three flows", () => {
  assert.deepEqual(expandFlowSelection("all"), ["research", "market", "rpc"]);
});
