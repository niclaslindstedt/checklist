/** @type {import('@bacons/apple-targets').Config} */
// The WidgetKit extension target, generated into the Xcode project by
// `@bacons/apple-targets` during `expo prebuild`. Every `.swift` file in this
// directory becomes part of the target; the App Group is what lets the widget
// read the snapshot the app writes (see `native/modules/widget-bridge`).
// The App Group has to match the main app's entitlement byte for byte, so both
// come from `../../identifiers.js` rather than being typed twice.
const { APP_GROUP } = require("../../identifiers.js");

module.exports = {
  type: "widget",
  name: "checklistwidget",
  entitlements: {
    "com.apple.security.application-groups": [APP_GROUP],
  },
  // iOS 17: the widgets use `containerBackground` and the interactive
  // check-off runs App Intents, both iOS 17 APIs, unguarded. The extension may
  // require more than the app (Expo 57's 16.4) — on iOS 16 the app runs and
  // simply offers no widgets. The iOS 18 control is `@available`-guarded.
  deploymentTarget: "17.0",
  frameworks: ["WidgetKit", "SwiftUI", "AppIntents"],
};
