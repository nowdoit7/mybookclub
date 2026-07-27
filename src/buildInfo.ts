import { isLoopbackHostname } from "./characterCore/runtime";

export interface AppBuildInfo {
  version: string;
  mode: string;
  branch: string;
  commit: string;
  dirty: boolean;
  fingerprint: string;
  builtAt: string;
}

const TEST_BUILD_INFO: AppBuildInfo = {
  version: "0.1.0",
  mode: "test",
  branch: "test",
  commit: "test",
  dirty: false,
  fingerprint: "test",
  builtAt: "1970-01-01T00:00:00.000Z",
};

export const APP_BUILD_INFO: AppBuildInfo =
  typeof __APP_BUILD_INFO__ === "undefined"
    ? TEST_BUILD_INFO
    : __APP_BUILD_INFO__;

export function shouldShowLocalBuildInfo(hostname: string): boolean {
  return isLoopbackHostname(hostname);
}

export function buildIdentifier(info: AppBuildInfo): string {
  const revision = info.dirty
    ? `${info.commit}-${info.fingerprint}`
    : info.commit;
  return `v${info.version} · ${info.mode}:${revision}`;
}
