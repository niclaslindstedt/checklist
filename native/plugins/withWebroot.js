// Copies the built web bundle (`native/webroot`, produced by `npm run
// build:web`) into both native projects during `expo prebuild`, so the
// static server has a real directory tree to serve.
//
// This has to be a config plugin rather than a one-off Xcode step: adding
// the folder by hand in Xcode does not survive `expo prebuild --clean`,
// which regenerates `ios/` and `android/` from scratch.

const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("expo/config-plugins");

// Directory name used consistently across both platforms and the runtime
// (`src/webroot.ts` resolves the same name via `resolveAssetsPath`).
const WEBROOT = "webroot";

function copyTree(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(
      `[withWebroot] Missing web build at ${from}. Run \`npm run build:web\` before prebuild.`,
    );
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

module.exports = function withWebroot(config) {
  // Android: anything under `src/main/assets` is packed into the APK
  // automatically, so no Gradle change is needed. The runtime still has to
  // extract it — APK assets are not real files. See `src/webroot.ts`.
  config = withDangerousMod(config, [
    "android",
    (c) => {
      copyTree(
        path.join(c.modRequest.projectRoot, WEBROOT),
        path.join(
          c.modRequest.platformProjectRoot,
          "app/src/main/assets",
          WEBROOT,
        ),
      );
      return c;
    },
  ]);

  config = withDangerousMod(config, [
    "ios",
    (c) => {
      copyTree(
        path.join(c.modRequest.projectRoot, WEBROOT),
        path.join(
          c.modRequest.platformProjectRoot,
          c.modRequest.projectName,
          WEBROOT,
        ),
      );
      return c;
    },
  ]);

  // Register the iOS copy as a *folder reference*. Without the
  // `lastKnownFileType` fixup Xcode adds it as an opaque file and the
  // directory structure is flattened into the bundle root, which breaks
  // every relative asset URL the SPA emits.
  config = withXcodeProject(config, (c) => {
    const project = c.modResults;
    const group = c.modRequest.projectName;
    const filepath = `${group}/${WEBROOT}`;
    if (!project.hasFile(filepath)) {
      const file = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: group,
        project,
        isBuildFile: true,
        verbose: true,
      });
      file.lastKnownFileType = "folder";
      delete file.explicitFileType;
    }
    return c;
  });

  return config;
};
