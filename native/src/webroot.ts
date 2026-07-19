import { Platform } from "react-native";
import { resolveAssetsPath } from "@dr.pogodin/react-native-static-server";
import {
  copyFileAssets,
  exists,
  readFile,
  unlink,
  writeFile,
} from "@dr.pogodin/react-native-fs";
import * as Application from "expo-application";

// Directory name shared with `plugins/withWebroot.js`.
const WEBROOT = "webroot";

// `copyFileAssets` writes into the documents directory, which survives app
// updates — so without a fingerprint the app would keep serving the web
// bundle from whichever version first ran on the device, forever. Stamping
// the native build id next to the extracted tree and re-extracting when it
// changes is what makes an App Store update actually take effect.
const stampPath = (dir: string) => `${dir}/.build-id`;

const buildId = () =>
  `${Application.nativeApplicationVersion ?? "0"}+${
    Application.nativeBuildVersion ?? "0"
  }`;

async function isStale(dir: string): Promise<boolean> {
  if (!(await exists(dir))) return true;
  try {
    return (await readFile(stampPath(dir), "utf8")) !== buildId();
  } catch {
    // Missing or unreadable stamp — treat as stale and re-extract.
    return true;
  }
}

/**
 * Returns a real directory the static server can serve.
 *
 * On iOS the folder reference added by the config plugin is already a real
 * directory inside the app bundle, so this is a no-op path resolve. On
 * Android the tree lives inside the APK as compressed assets, which are not
 * files on disk, so it has to be extracted once per native build.
 */
export async function prepareWebroot(): Promise<string> {
  const target = resolveAssetsPath(WEBROOT);
  if (Platform.OS !== "android") return target;

  if (await isStale(target)) {
    if (await exists(target)) await unlink(target);
    await copyFileAssets(WEBROOT, target);
    await writeFile(stampPath(target), buildId(), "utf8");
  }
  return target;
}
