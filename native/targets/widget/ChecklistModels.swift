// The widget extension's view of the app's data. These `Codable` structs match
// the JSON the web app publishes (`src/domain/widget-snapshot.ts`) byte for
// byte, and `SharedStore` reads that JSON out of the App Group container the
// app writes it to. The extension only ever *reads* the snapshot; the one
// write path is the interactive check-off, which appends an action to a
// separate queue the app drains (see `ToggleItemIntent`).

import Foundation
import WidgetKit

// Must match the app module, the entitlements, and `APP_GROUP` in JS.
let appGroup = "group.se.niclaslindstedt.checklist"
let snapshotKey = "widget_snapshot"
let actionsKey = "widget_actions"
let darwinActionName = "se.niclaslindstedt.checklist.widgetAction"

struct WidgetItemView: Codable, Hashable {
  let id: String
  let title: String
  let deadline: String?
}

struct WidgetListSummary: Codable, Hashable {
  let id: String
  let name: String
  let glyph: String?
  let color: String?
  let total: Int
  let checked: Int

  var remaining: Int { max(0, total - checked) }
  var fraction: Double { total == 0 ? 0 : Double(checked) / Double(total) }
}

struct WidgetActiveList: Codable, Hashable {
  let id: String
  let name: String
  let glyph: String?
  let color: String?
  let total: Int
  let checked: Int
  let open: [WidgetItemView]

  var fraction: Double { total == 0 ? 0 : Double(checked) / Double(total) }
  var remaining: Int { max(0, total - checked) }
}

struct WidgetDueItem: Codable, Hashable {
  let id: String
  let listId: String
  let listName: String
  let title: String
  let deadline: String
  let status: String  // "overdue" | "due-soon"

  var isOverdue: Bool { status == "overdue" }
}

struct WidgetSnapshot: Codable {
  let version: Int
  let updatedAt: String
  let active: WidgetActiveList?
  let lists: [WidgetListSummary]
  let due: [WidgetDueItem]

  /// An empty snapshot used before the app has published anything (fresh
  /// install) so a placed widget renders a calm empty state, not an error.
  static let empty = WidgetSnapshot(
    version: 1, updatedAt: "", active: nil, lists: [], due: []
  )
}

enum SharedStore {
  /// The latest published snapshot, or `.empty` when none is stored yet.
  static func read() -> WidgetSnapshot {
    guard
      let defaults = UserDefaults(suiteName: appGroup),
      let json = defaults.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    else {
      return .empty
    }
    return snapshot
  }

  /// Queue a widget action for the app to drain, then wake it. Runs in the
  /// extension process, so it can't touch the WebView store directly — it
  /// appends to the shared queue and posts a Darwin notification the app's
  /// `WidgetBridgeModule` observes (see the module for the app-side drain).
  static func enqueue(action: [String: String]) {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    var queue = defaults.array(forKey: actionsKey) as? [[String: String]] ?? []
    queue.append(action)
    defaults.set(queue, forKey: actionsKey)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinActionName as CFString),
      nil, nil, true
    )
  }
}
