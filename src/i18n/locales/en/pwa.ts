import type { Widen } from "./_widen";

const pwa = {
  updateReady: "Updated to {version} — reload to apply",
  updateReadyGeneric: "A new version is ready — reload to apply",
  reload: "Reload",
  dismiss: "Dismiss update notice",
} as const;

export type PwaCatalog = Widen<typeof pwa>;

export default pwa;
