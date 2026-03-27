import pkg from "../../package.json";

export const HEALTH_SERVICE_NAME = pkg.name;
export const HEALTH_VERSION = pkg.version ?? "0.0.0";

export function healthPayload(
  status: "pass" | "fail",
  extra?: { detail?: string; checks?: { database: "pass" | "fail" } },
) {
  return {
    status,
    service: HEALTH_SERVICE_NAME,
    version: HEALTH_VERSION,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    ...extra,
  };
}
