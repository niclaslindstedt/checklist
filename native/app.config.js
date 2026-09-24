// Expo app config, as a FUNCTION rather than a static `app.json`: the values
// that identify this app IN THE STORES are not checked in, and only an
// executable config can read them from the environment. See ./identifiers.js
// for the three variables and the guard that fails a production build without
// them.
//
// `slug` stays literal — it is the project's own name rather than a listing
// coordinate, and EAS resolves the project by slug.
//
// The URL SCHEME is the bundle id (reverse-DNS, as RFC 8252 §7.1 asks of a
// native app's redirect scheme): `se.agilator.checklist` in the store build,
// `dev.local.checklist` in a plain checkout. So a Dropbox sign-in comes back
// on `<bundle id>://oauth` and a widget opens `<bundle id>://add?list=…`, and
// no two builds of the app claim the same scheme. It is never committed; the
// widget extension, which cannot read the environment, gets it from the
// Info.plist `plugins/withWidgets.js` writes.

const {
  DISPLAY_NAME,
  BUNDLE_ID,
  EAS_PROJECT_ID,
  APP_GROUP,
  ICLOUD_KVS,
} = require("./identifiers.js");

module.exports = () => ({
  expo: {
    name: DISPLAY_NAME,
    slug: "checklist",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    scheme: BUNDLE_ID,
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0f1115",
    },
    plugins: [
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 28,
            usesCleartextTraffic: true,
          },
        },
      ],
      "./plugins/withWebroot",
      "./plugins/withWidgets",
      [
        "expo-notifications",
        {
          color: "#1f2933",
        },
      ],
      [
        "@bacons/apple-targets",
        {
          appleTeamId: "$(TeamIdentifierPrefix)",
        },
      ],
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      entitlements: {
        // The iCloud key-value container, and the group shared with the widget
        // extension. Both come from ./identifiers.js so neither is typed twice.
        "com.apple.developer.ubiquity-kvstore-identifier": `$(TeamIdentifierPrefix)${ICLOUD_KVS}`,
        "com.apple.security.application-groups": [APP_GROUP],
      },
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
          NSAllowsArbitraryLoadsInWebContent: true,
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: false,
            },
          },
        },
      },
    },
    android: {
      package: BUNDLE_ID,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1f2933",
      },
    },
    extra: {
      // The shared container, for the JS half of the widget bridge. Read back
      // through `expoConfig.extra` so no consumer builds the string itself.
      appGroup: APP_GROUP,
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  },
});
