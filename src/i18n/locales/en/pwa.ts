import type { Widen } from "./_widen";

const pwa = {
  updateReady: "Updated to {version} — reload to apply",
  updateReadyGeneric: "A new version is ready — reload to apply",
  downloading: "Downloading update… {percent}%",
  reload: "Reload",
  dismiss: "Dismiss update notice",
  pullToRefresh: "Pull to refresh",
  releaseToRefresh: "Release to refresh",
  refreshing: "Refreshing…",
} as const;

export type PwaCatalog = Widen<typeof pwa>;

export default pwa;
