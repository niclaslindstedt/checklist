// An iOS 18 Control Center / Lock Screen / Action Button control that jumps
// straight into the composer for the active list — the platform-polish pairing
// for the Quick Add widget. Very cheap once the `checklist://add` deep link
// exists: the control just opens that URL.

import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct QuickAddControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "ChecklistQuickAddControl") {
      ControlWidgetButton(action: OpenChecklistComposerIntent()) {
        Label("Add to checklist", systemImage: "plus.circle")
      }
    }
    .displayName("Add to checklist")
    .description("Jump straight to adding an item to your active list.")
  }
}

/// Opens the app on the active list's composer. Resolves the active list from
/// the shared snapshot, falling back to a bare `checklist://add` the wrapper
/// still routes to the current list.
@available(iOS 18.0, *)
struct OpenChecklistComposerIntent: AppIntent {
  static var title: LocalizedStringResource = "Add to checklist"
  static var openAppWhenRun = true

  func perform() async throws -> some IntentResult & OpensIntent {
    let id = SharedStore.read().active?.id
    let url = id.map { DeepLink.add($0) } ?? URL(string: "checklist://add")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}
