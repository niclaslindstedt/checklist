import type { Widen } from "./_widen";

const pwa = {
  updateReady: "Update ready",
  updateVersion: "v{version}",
  updateAction: "Update",
  downloading: "Downloading update… {percent}%",
  dismiss: "Dismiss update notice",
  pullToRefresh: "Pull to refresh",
  releaseToRefresh: "Release to refresh",
  refreshing: "Refreshing…",
} as const;

export type PwaCatalog = Widen<typeof pwa>;

export default pwa;
