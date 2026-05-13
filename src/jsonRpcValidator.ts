export type JsonRpcOutputShape = "json_rpc_health" | "json_rpc_balance" | "json_rpc_slot";

export interface JsonRpcValidationResult {
  jsonRpcValid: boolean;
  jsonRpcMethod: string | null;
  jsonRpcResultShapeValid: boolean;
  slot: number | null;
  apiVersion: string | null;
  validationError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateJsonRpcResponse(
  outputShape: JsonRpcOutputShape,
  jsonRpcMethod: string,
  payload: unknown,
): JsonRpcValidationResult {
  if (!isRecord(payload)) {
    return {
      jsonRpcValid: false,
      jsonRpcMethod,
      jsonRpcResultShapeValid: false,
      slot: null,
      apiVersion: null,
      validationError: "payload_not_object",
    };
  }

  const errorField = payload.error;
  if (errorField !== undefined && errorField !== null) {
    return {
      jsonRpcValid: false,
      jsonRpcMethod,
      jsonRpcResultShapeValid: false,
      slot: null,
      apiVersion: null,
      validationError: "json_rpc_error_present",
    };
  }

  const result = payload.result;
  if (result === undefined) {
    return {
      jsonRpcValid: false,
      jsonRpcMethod,
      jsonRpcResultShapeValid: false,
      slot: null,
      apiVersion: null,
      validationError: "missing_result",
    };
  }

  if (outputShape === "json_rpc_health") {
    const shapeValid = result === "ok";
    return {
      jsonRpcValid: shapeValid,
      jsonRpcMethod,
      jsonRpcResultShapeValid: shapeValid,
      slot: null,
      apiVersion: null,
      validationError: shapeValid ? null : "health_result_not_ok",
    };
  }

  if (outputShape === "json_rpc_slot") {
    const shapeValid = typeof result === "number" && Number.isFinite(result);
    return {
      jsonRpcValid: shapeValid,
      jsonRpcMethod,
      jsonRpcResultShapeValid: shapeValid,
      slot: shapeValid ? result : null,
      apiVersion: null,
      validationError: shapeValid ? null : "slot_result_not_number",
    };
  }

  if (!isRecord(result)) {
    return {
      jsonRpcValid: false,
      jsonRpcMethod,
      jsonRpcResultShapeValid: false,
      slot: null,
      apiVersion: null,
      validationError: "balance_result_not_object",
    };
  }

  const value = result.value;
  const context = isRecord(result.context) ? result.context : null;
  const slot = context && typeof context.slot === "number" && Number.isFinite(context.slot)
    ? context.slot
    : null;
  const apiVersion = context && typeof context.apiVersion === "string"
    ? context.apiVersion
    : null;
  const valueValid = typeof value === "number" && Number.isFinite(value);
  const slotValid = typeof slot === "number";
  const shapeValid = valueValid && slotValid;

  return {
    jsonRpcValid: shapeValid,
    jsonRpcMethod,
    jsonRpcResultShapeValid: shapeValid,
    slot,
    apiVersion,
    validationError: shapeValid ? null : "balance_result_shape_invalid",
  };
}
