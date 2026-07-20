// "Quick add" — a small widget (and Lock Screen rectangular) that deep-links
// straight into the composer for the active list via `checklist://add?list=…`.
// Cheap once the deep link exists; paired with an iOS 18 Control Center control
// in `QuickAddControl.swift`.

import SwiftUI
import WidgetKit

struct QuickAddEntry: TimelineEntry {
  let date: Date
  let list: WidgetListSummary?
}

struct QuickAddProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuickAddEntry {
    QuickAddEntry(date: Date(), list: nil)
  }
  func getSnapshot(in context: Context, completion: @escaping (QuickAddEntry) -> Void) {
    completion(entry())
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<QuickAddEntry>) -> Void) {
    completion(Timeline(entries: [entry()], policy: .never))
  }
  private func entry() -> QuickAddEntry {
    let active = SharedStore.read().active
    let list = active.map {
      WidgetListSummary(id: $0.id, name: $0.name, glyph: $0.glyph, color: $0.color,
                        total: $0.total, checked: $0.checked)
    }
    return QuickAddEntry(date: Date(), list: list)
  }
}

struct QuickAddWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ChecklistQuickAdd", provider: QuickAddProvider()) { entry in
      QuickAddView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("Quick add")
    .description("Jump straight to adding an item to your active list.")
    .supportedFamilies([.systemSmall, .accessoryRectangular])
  }
}

struct QuickAddView: View {
  @Environment(\.widgetFamily) private var family
  let entry: QuickAddEntry

  var body: some View {
    let url = entry.list.map { DeepLink.add($0.id) }
    Group {
      if family == .accessoryRectangular {
        HStack(spacing: 6) {
          Image(systemName: "plus.circle.fill")
          Text(entry.list?.name ?? "Add item").lineLimit(1)
        }
      } else {
        VStack(spacing: 8) {
          Image(systemName: "plus.circle.fill").font(.largeTitle)
          Text("Add item").font(.headline)
          if let name = entry.list?.name {
            Text(name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
    }
    .widgetURL(url)
  }
}
