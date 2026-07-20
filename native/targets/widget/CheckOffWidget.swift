// "Interactive check-off" — the strongest of the set. Lists the next open items
// from a chosen list (or the active one) with real, tappable checkboxes. iOS
// 17+ App Intents let the tap toggle the item without launching the app; the
// toggle is queued for the app to apply through its normal edit path (see
// `ToggleItemIntent`). Configurable per instance so several lists can be pinned.

import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 17.0, *)
struct CheckOffEntry: TimelineEntry {
  let date: Date
  let list: WidgetActiveList?
}

@available(iOS 17.0, *)
struct CheckOffProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> CheckOffEntry {
    CheckOffEntry(date: Date(), list: nil)
  }

  func snapshot(for configuration: SelectListIntent, in context: Context) async -> CheckOffEntry {
    CheckOffEntry(date: Date(), list: resolve(configuration))
  }

  func timeline(for configuration: SelectListIntent, in context: Context) async -> Timeline<CheckOffEntry> {
    Timeline(entries: [CheckOffEntry(date: Date(), list: resolve(configuration))], policy: .never)
  }

  // The configured list if it still exists, else the app's active list — so a
  // freshly-placed widget shows something before it's been configured, and a
  // widget pinned to a since-deleted list degrades gracefully.
  private func resolve(_ configuration: SelectListIntent) -> WidgetActiveList? {
    let snapshot = SharedStore.read()
    if let id = configuration.list?.id,
       let match = snapshot.lists.first(where: { $0.id == id }) {
      // The per-list summary lacks `open`; rebuild from `active` when it's the
      // same list, otherwise fall back to a summary-only projection.
      if let active = snapshot.active, active.id == id { return active }
      return WidgetActiveList(
        id: match.id, name: match.name, glyph: match.glyph, color: match.color,
        total: match.total, checked: match.checked, open: []
      )
    }
    return snapshot.active
  }
}

@available(iOS 17.0, *)
struct CheckOffWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "ChecklistCheckOff",
      intent: SelectListIntent.self,
      provider: CheckOffProvider()
    ) { entry in
      CheckOffView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("Check off")
    .description("Tick off items from a list without opening the app.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

@available(iOS 17.0, *)
struct CheckOffView: View {
  @Environment(\.widgetFamily) private var family
  let entry: CheckOffEntry

  private var rowCount: Int { family == .systemLarge ? 7 : 3 }

  var body: some View {
    if let list = entry.list {
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(list.name).font(.headline).lineLimit(1)
          Spacer()
          Text("\(list.checked)/\(list.total)")
            .font(.caption).monospacedDigit().foregroundStyle(.secondary)
        }
        if list.open.isEmpty {
          Spacer()
          Text("All done 🎉").font(.subheadline).foregroundStyle(.secondary)
          Spacer()
        } else {
          ForEach(list.open.prefix(rowCount), id: \.id) { item in
            Button(intent: ToggleItemIntent(listId: list.id, itemId: item.id)) {
              HStack(spacing: 8) {
                Image(systemName: "circle")
                  .foregroundStyle(Color(hex: list.color) ?? .accentColor)
                Text(item.title).font(.subheadline).lineLimit(1)
                Spacer(minLength: 0)
              }
            }
            .buttonStyle(.plain)
          }
          Spacer(minLength: 0)
        }
      }
      .padding(4)
    } else {
      Text("No list").foregroundStyle(.secondary)
    }
  }
}
