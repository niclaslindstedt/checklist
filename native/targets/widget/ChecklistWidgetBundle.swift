// The widget extension's entry point: the bundle listing every widget the app
// ships. Each widget is defined in its own file; this only assembles them.
// Interactive check-off and configuration need iOS 17, so that widget is
// gated — the read-only progress and due-today widgets work back to iOS 16.

import SwiftUI
import WidgetKit

@main
struct ChecklistWidgetBundle: WidgetBundle {
  @WidgetBundleBuilder
  var body: some Widget {
    ProgressWidget()
    DueTodayWidget()
    QuickAddWidget()
    if #available(iOS 17.0, *) {
      CheckOffWidget()
    }
    if #available(iOS 18.0, *) {
      QuickAddControl()
    }
  }
}
