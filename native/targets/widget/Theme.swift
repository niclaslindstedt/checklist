// Small shared UI helpers for the widgets. Widgets respect the app's per-list
// accent colour where the platform allows, but otherwise lean on the system
// widget look rather than fighting it.

import SwiftUI

extension Color {
  /// Parse a `#rrggbb` / `#rgb` string the app stores as a list accent. Falls
  /// back to the widget's tint colour when the string isn't a usable hex.
  init?(hex: String?) {
    guard var hex else { return nil }
    hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    if hex.count == 3 {
      hex = hex.map { "\($0)\($0)" }.joined()
    }
    guard hex.count == 6, let value = UInt64(hex, radix: 16) else { return nil }
    self.init(
      .sRGB,
      red: Double((value & 0xFF0000) >> 16) / 255,
      green: Double((value & 0x00FF00) >> 8) / 255,
      blue: Double(value & 0x0000FF) / 255
    )
  }
}

/// The deep link that opens (or focuses the composer of) a given list — the
/// scheme the native wrapper maps back onto the web app (`useWidgetDeepLink`).
///
/// The scheme is the app's bundle id, which differs per build (the store
/// build, a dev build), so it is never spelled here: `plugins/withWidgets.js`
/// writes it into this extension's Info.plist as `ChecklistURLScheme` at
/// prebuild. Should that key ever be missing, the extension's own bundle id
/// minus its last component (`<app>.widget` → `<app>`) is the same string.
enum DeepLink {
  static let scheme: String = {
    if let value = Bundle.main.object(forInfoDictionaryKey: "ChecklistURLScheme") as? String,
       !value.isEmpty {
      return value
    }
    let own = Bundle.main.bundleIdentifier ?? ""
    return own.split(separator: ".").dropLast().joined(separator: ".")
  }()

  static func open(_ listId: String) -> URL {
    URL(string: "\(scheme)://open?list=\(listId)")!
  }
  static func add(_ listId: String) -> URL {
    URL(string: "\(scheme)://add?list=\(listId)")!
  }
  /// The active list's composer, whichever list that is.
  static var addToActive: URL {
    URL(string: "\(scheme)://add")!
  }
}
