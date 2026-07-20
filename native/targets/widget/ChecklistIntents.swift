// The App Intents the widgets use: the interactive check-off action, and the
// configuration that lets a user pin a widget to a specific list.

import AppIntents
import WidgetKit

/// Tick (or untick) an item straight from the widget. iOS 17+ runs this in the
/// extension without launching the app; it queues the toggle for the app to
/// apply through its normal edit path (so the write goes through the same save
/// / conflict handling as a tap in the app) and reloads the timelines so the
/// row's checkbox updates immediately.
@available(iOS 17.0, *)
struct ToggleItemIntent: AppIntent {
  static var title: LocalizedStringResource = "Toggle checklist item"
  static var isDiscoverable = false

  @Parameter(title: "List") var listId: String
  @Parameter(title: "Item") var itemId: String

  init() {}
  init(listId: String, itemId: String) {
    self.listId = listId
    self.itemId = itemId
  }

  func perform() async throws -> some IntentResult {
    SharedStore.enqueue(action: ["type": "toggle", "listId": listId, "itemId": itemId])
    WidgetCenter.shared.reloadAllTimelines()
    return .result()
  }
}

/// A pickable checklist, sourced from the published snapshot, so a configurable
/// widget can be pinned to a particular list.
@available(iOS 17.0, *)
struct ListEntity: AppEntity {
  let id: String
  let name: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Checklist"
  static var defaultQuery = ListQuery()

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }
}

@available(iOS 17.0, *)
struct ListQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [ListEntity] {
    let lists = SharedStore.read().lists
    return lists
      .filter { identifiers.contains($0.id) }
      .map { ListEntity(id: $0.id, name: $0.name) }
  }

  func suggestedEntities() async throws -> [ListEntity] {
    SharedStore.read().lists.map { ListEntity(id: $0.id, name: $0.name) }
  }

  func defaultResult() async -> ListEntity? {
    guard let first = SharedStore.read().lists.first else { return nil }
    return ListEntity(id: first.id, name: first.name)
  }
}

/// Configuration for the list-scoped widgets: which checklist to show. Leaving
/// it unset falls back to the app's active list.
@available(iOS 17.0, *)
struct SelectListIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Choose a checklist"
  static var description = IntentDescription("Pick which checklist this widget shows.")

  @Parameter(title: "Checklist") var list: ListEntity?

  init() {}
  init(list: ListEntity?) { self.list = list }
}
