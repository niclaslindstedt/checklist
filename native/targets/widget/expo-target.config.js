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
  // Interactive widgets (App Intents) need iOS 17; the read-only widgets work
  // lower, but one deployment target is simpler and 15.1 matches the app.
  deploymentTarget: "15.1",
  frameworks: ["WidgetKit", "SwiftUI", "AppIntents"],
};
