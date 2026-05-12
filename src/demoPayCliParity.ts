import { providerEndpointMap } from "./providerEndpointMap";

function main(): void {
  const mapping = providerEndpointMap.find((m) => m.endpointMappingId === "quicknode-rpc-health");
  if (!mapping) {
    throw new Error("quicknode-rpc-health mapping not found");
  }
  const bodyJson = JSON.stringify(mapping.body);
  const commandShape = [
    `pay curl ${mapping.url} \\`,
    `  -X ${mapping.method} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${bodyJson}'`,
  ].join("\n");

  console.log("QuickNode pay_cli manual parity command shape:");
  console.log(commandShape);
}

main();
