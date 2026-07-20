// "Active list progress" — a ring of items checked vs. total with the list
// name beneath. Read-only and cheap: it exercises the whole mirror pipeline
// with minimal risk, and it's the natural Lock Screen / StandBy shape
// (`accessoryCircular`). Shows the app's active list.

import SwiftUI
import WidgetKit

struct ProgressEntry: TimelineEntry {
  let date: Date
  let list: WidgetListSummary?
}

struct ProgressProvider: TimelineProvider {
  func placeholder(in context: Context) -> ProgressEntry {
    ProgressEntry(date: Date(), list: WidgetListSummary(
      id: "", name: "Groceries", glyph: nil, color: nil, total: 6, checked: 4
    ))
  }

  func getSnapshot(in context: Context, completion: @escaping (ProgressEntry) -> Void) {
    completion(entry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ProgressEntry>) -> Void) {
    // The snapshot is push-refreshed by the app on every edit, so a single
    // entry with `.never` reload is right — no polling.
    completion(Timeline(entries: [entry()], policy: .never))
  }

  private func entry() -> ProgressEntry {
    let snapshot = SharedStore.read()
    let active = snapshot.active
    let list = active.map {
      WidgetListSummary(
        id: $0.id, name: $0.name, glyph: $0.glyph, color: $0.color,
        total: $0.total, checked: $0.checked
      )
    }
    return ProgressEntry(date: Date(), list: list)
  }
}

struct ProgressWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ChecklistProgress", provider: ProgressProvider()) { entry in
      ProgressWidgetView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("List progress")
    .description("How far through your active checklist you are.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

struct ProgressWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ProgressEntry

  var body: some View {
    if let list = entry.list, list.total > 0 {
      switch family {
      case .accessoryCircular:
        Gauge(value: list.fraction) {
          Text("\(list.checked)/\(list.total)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
      default:
        smallRing(list)
      }
    } else {
      emptyState
    }
  }

  private func smallRing(_ list: WidgetListSummary) -> some View {
    let accent = Color(hex: list.color) ?? .accentColor
    return VStack(spacing: 8) {
      ZStack {
        Circle().stroke(accent.opacity(0.2), lineWidth: 8)
        Circle()
          .trim(from: 0, to: list.fraction)
          .stroke(accent, style: StrokeStyle(lineWidth: 8, lineCap: .round))
          .rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text("\(list.checked)/\(list.total)")
            .font(.headline).monospacedDigit()
          Text("done").font(.caption2).foregroundStyle(.secondary)
        }
      }
      Text(list.name).font(.caption).lineLimit(1).foregroundStyle(.secondary)
    }
    .padding(4)
    .widgetURL(DeepLink.open(list.id))
  }

  private var emptyState: some View {
    VStack(spacing: 4) {
      Image(systemName: "checklist").font(.title2).foregroundStyle(.secondary)
      Text("No items").font(.caption).foregroundStyle(.secondary)
    }
  }
}
