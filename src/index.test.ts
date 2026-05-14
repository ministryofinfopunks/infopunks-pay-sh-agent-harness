import test from "node:test";
import assert from "node:assert/strict";

test("public index imports without throwing", async () => {
  const publicApi = await import("./index");

  assert.equal(typeof publicApi.radarPreflightAndExecute, "function");
  assert.equal(typeof publicApi.callRadarPreflight, "function");
  assert.equal(typeof publicApi.executeLivePayShCall, "function");
  assert.equal(typeof publicApi.routeProvider, "function");
});
