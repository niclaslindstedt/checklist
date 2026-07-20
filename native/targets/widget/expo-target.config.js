/** @type {import('@bacons/apple-targets').Config} */
// The WidgetKit extension target, generated into the Xcode project by
// `@bacons/apple-targets` during `expo prebuild`. Every `.swift` file in this
// directory becomes part of the target; the App Group is what lets the widget
// read the snapshot the app writes (see `native/modules/widget-bridge`).
module.exports = {
  type: "widget",
  name: "checklistwidget",
  // Must match the main app's App Group and the entitlement in `app.json`.
  entitlements: {
    "com.apple.security.application-groups": [
      "group.se.niclaslindstedt.checklist",
    ],
  },
  // Interactive widgets (App Intents) need iOS 17; the read-only widgets work
  // lower, but one deployment target is simpler and 15.1 matches the app.
  deploymentTarget: "15.1",
  frameworks: ["WidgetKit", "SwiftUI", "AppIntents"],
};
