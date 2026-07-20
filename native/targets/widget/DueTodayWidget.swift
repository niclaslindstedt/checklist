// "Due today" — what's due today or overdue across every list, so the deadline
// feature shows up where people actually look. The empty state reads as calm
// ("Nothing due"), never broken.

import SwiftUI
import WidgetKit

struct DueEntry: TimelineEntry {
  let date: Date
  let due: [WidgetDueItem]
}

struct DueProvider: TimelineProvider {
  func placeholder(in context: Context) -> DueEntry {
    DueEntry(date: Date(), due: [])
  }
  func getSnapshot(in context: Context, completion: @escaping (DueEntry) -> Void) {
    completion(DueEntry(date: Date(), due: SharedStore.read().due))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<DueEntry>) -> Void) {
    completion(Timeline(entries: [DueEntry(date: Date(), due: SharedStore.read().due)], policy: .never))
  }
}

struct DueTodayWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ChecklistDueToday", provider: DueProvider()) { entry in
      DueTodayView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("Due today")
    .description("Tasks due today or overdue, across your lists.")
    .supportedFamilies([.systemMedium])
  }
}

struct DueTodayView: View {
  let entry: DueEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("Due today").font(.headline)
        Spacer()
        if !entry.due.isEmpty {
          Text("\(entry.due.count)")
            .font(.subheadline).foregroundStyle(.secondary)
        }
      }
      if entry.due.isEmpty {
        Spacer()
        HStack {
          Spacer()
          VStack(spacing: 4) {
            Image(systemName: "checkmark.circle").font(.title2).foregroundStyle(.green)
            Text("Nothing due").font(.subheadline).foregroundStyle(.secondary)
          }
          Spacer()
        }
        Spacer()
      } else {
        ForEach(entry.due.prefix(3), id: \.id) { item in
          HStack(spacing: 6) {
            Circle()
              .fill(item.isOverdue ? Color.red : Color.orange)
              .frame(width: 7, height: 7)
            Text(item.title).font(.subheadline).lineLimit(1)
            Spacer(minLength: 4)
            Text(item.listName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
        }
        if entry.due.count > 3 {
          Text("+\(entry.due.count - 3) more").font(.caption).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
      }
    }
    .padding(4)
  }
}
