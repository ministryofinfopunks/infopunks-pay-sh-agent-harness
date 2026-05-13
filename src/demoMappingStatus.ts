import { providerEndpointMap, ProviderEndpointMapping, ProviderEndpointStatus } from "./providerEndpointMap";

type MappingStatusGroup = "verified_pay_cli_success" | "intermittent_pay_cli_success" | "verified_402" | "candidate_unverified";

const GROUPS: MappingStatusGroup[] = [
  "verified_pay_cli_success",
  "intermittent_pay_cli_success",
  "verified_402",
  "candidate_unverified",
];

function getStatusGroup(mapping: ProviderEndpointMapping): MappingStatusGroup {
  const status = mapping.status as ProviderEndpointStatus | "candidate_unverified";
  return status === "unverified" ? "candidate_unverified" : status;
}

function printMapping(mapping: ProviderEndpointMapping): void {
  console.log(`- providerId: ${mapping.providerId}`);
  console.log(`  endpointMappingId: ${mapping.endpointMappingId}`);
  console.log(`  outputShape: ${mapping.outputShape}`);
  console.log(`  notes: ${mapping.notes}`);
}

function main(): void {
  for (const group of GROUPS) {
    const mappings = providerEndpointMap.filter((mapping) => getStatusGroup(mapping) === group);
    if (group === "candidate_unverified" && mappings.length === 0) {
      continue;
    }

    console.log(group);
    if (mappings.length === 0) {
      console.log("- none");
      continue;
    }

    for (const mapping of mappings) {
      printMapping(mapping);
    }
  }
}

main();
