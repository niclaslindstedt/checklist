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
enum DeepLink {
  static func open(_ listId: String) -> URL {
    URL(string: "checklist://open?list=\(listId)")!
  }
  static func add(_ listId: String) -> URL {
    URL(string: "checklist://add?list=\(listId)")!
  }
}
