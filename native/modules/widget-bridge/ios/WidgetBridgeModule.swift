// THE APP ↔ WIDGET SEAM, Apple side.
//
// The WidgetKit extension (native/targets/widget) is a separate process with
// its own container. The one thing it shares with the app is the App Group, so
// the app writes the snapshot into the group's `UserDefaults` and the
// extension reads it back while building a timeline (`SharedStore.read` in
// ChecklistModels.swift).
//
// Traffic runs the other way too, which is what makes this more than
// calendar's sibling module: the check-off widget is interactive, and an
// extension cannot reach into the app's WebView store. So it appends the tap
// to a queue in the same container and posts a Darwin notification
// (`SharedStore.enqueue`). This module observes that notification, tells JS,
// and hands over the queue when JS asks — see `takePendingActions`.
//
// Every key and name here is the other half of a constant in
// ChecklistModels.swift. They are spelled out rather than shared because the
// extension and the app are separate compilation units with no common target.

import ExpoModulesCore
import WidgetKit

/// The App Group both processes address. In step with `../index.ts`,
/// `app.config.js`, `plugins/withWidgets.js`, the widget target's
/// entitlements and `targets/widget/ChecklistModels.swift` — changing it after
/// release orphans every installed widget's data.
private let APP_GROUP = "group.se.agilator.checklist"

/// The snapshot JSON the app publishes.
private let SNAPSHOT_KEY = "widget_snapshot"

/// The actions the interactive widget has queued since the app last drained.
private let ACTIONS_KEY = "widget_actions"

/// The Darwin notification the extension posts after queueing one.
private let DARWIN_ACTION_NAME = "se.agilator.checklist.widgetAction"

public final class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    // Matches `requireNativeModule("WidgetBridgeModule")` in ../index.ts.
    Name("WidgetBridgeModule")

    Events("onWidgetAction")

    /// Publish a new snapshot and refresh every widget.
    ///
    /// Throws rather than failing quietly when the group is unreachable: that
    /// means the entitlement is missing from the build, which is a
    /// misconfiguration a developer must see rather than a condition the user
    /// can act on. `native/src/widgets.ts` logs it and carries on.
    AsyncFunction("setSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: APP_GROUP) else {
        throw WidgetGroupUnavailableException()
      }
      defaults.set(json, forKey: SNAPSHOT_KEY)
      reloadTimelines()
    }

    /// Take the queued widget actions as a JSON array string, and clear them.
    ///
    /// Read and clear are one step on purpose: an action applied twice would
    /// toggle an item back, so the queue is drained rather than read. Returns
    /// nil when there is nothing waiting, which is the common case.
    AsyncFunction("takePendingActions") { () -> String? in
      guard let defaults = UserDefaults(suiteName: APP_GROUP) else {
        throw WidgetGroupUnavailableException()
      }
      guard let queued = defaults.array(forKey: ACTIONS_KEY) as? [[String: String]],
        !queued.isEmpty
      else {
        return nil
      }
      defaults.removeObject(forKey: ACTIONS_KEY)

      guard let data = try? JSONSerialization.data(withJSONObject: queued),
        let json = String(data: data, encoding: .utf8)
      else {
        // The queue held something that will never decode; dropping it is
        // right — it has already been removed, and keeping it would wedge
        // every later drain behind the same failure.
        return nil
      }
      return json
    }

    /// Re-render the widgets from the snapshot already in the container. The
    /// app calls this when the date rolls over while it is running: nothing
    /// has changed except which items are due.
    AsyncFunction("reloadAll") {
      reloadTimelines()
    }

    OnStartObserving {
      self.startObservingWidgetActions()
    }

    OnStopObserving {
      self.stopObservingWidgetActions()
    }

    OnDestroy {
      self.stopObservingWidgetActions()
    }
  }

  private var observing = false

  /// Darwin notifications are delivered to a C callback that cannot capture
  /// context, so the module is passed as the observer pointer and read back
  /// out of it. Unretained: the notification centre does not own the module,
  /// and `OnDestroy` removes the observer before it can dangle.
  private func startObservingWidgetActions() {
    guard !observing else { return }
    observing = true
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let module = Unmanaged<WidgetBridgeModule>.fromOpaque(observer)
          .takeUnretainedValue()
        module.sendEvent("onWidgetAction", [:])
      },
      DARWIN_ACTION_NAME as CFString,
      nil,
      .deliverImmediately
    )
  }

  private func stopObservingWidgetActions() {
    guard observing else { return }
    observing = false
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(DARWIN_ACTION_NAME as CFString),
      nil
    )
  }
}

/// WidgetKit is iOS 14+; below that the app simply has no widgets and this is
/// a no-op rather than a link error.
private func reloadTimelines() {
  if #available(iOS 14.0, *) {
    WidgetCenter.shared.reloadAllTimelines()
  }
}

internal final class WidgetGroupUnavailableException: Exception {
  override var reason: String {
    "The App Group \(APP_GROUP) is unavailable — check the app's entitlements."
  }
}
