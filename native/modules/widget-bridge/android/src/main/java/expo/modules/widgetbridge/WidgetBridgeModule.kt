// THE APP ↔ WIDGET SEAM, Android side (see ../index.ts for the JS contract).
//
// Android has no App Groups: a widget provider runs in the same process as the
// app, so "the shared container" is just a preferences file both halves open by
// name. The name is the iOS App Group string, so one identifier means the same
// thing on both platforms and there is no second thing to keep in step.
//
// The action queue below is read but never written on this platform. The
// interactive check-off is an App Intent, which is iOS only; the Android widget
// opens the app instead. `takePendingActions` is implemented anyway so both
// platforms answer the same JS call the same way — nil/null meaning "nothing
// waiting" — rather than one of them throwing.

package expo.modules.widgetbridge

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The preferences file both halves open. Mirrors the iOS App Group. */
private const val SHARED_PREFS = "group.se.agilator.checklist"

/** The snapshot JSON the app publishes. */
private const val SNAPSHOT_KEY = "widget_snapshot"

/** Actions the widget has queued since the app last drained them. */
private const val ACTIONS_KEY = "widget_actions"

/** The provider the plugin registers; see ../../../plugins/withWidgets.js. */
private const val RECEIVER = "se.agilator.checklist.widget.ChecklistWidgetReceiver"

class WidgetBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    // Matches `requireNativeModule("WidgetBridgeModule")` in ../index.ts.
    Name("WidgetBridgeModule")

    Events("onWidgetAction")

    AsyncFunction("setSnapshot") { json: String ->
      prefs().edit().putString(SNAPSHOT_KEY, json).apply()
      notifyWidgets()
    }

    AsyncFunction("takePendingActions") { ->
      val queued = prefs().getString(ACTIONS_KEY, null)
      if (queued.isNullOrEmpty()) {
        null
      } else {
        // Read and clear in one step: an action applied twice toggles the item
        // back, so the queue is drained rather than read.
        prefs().edit().remove(ACTIONS_KEY).apply()
        queued
      }
    }

    AsyncFunction("reloadAll") { notifyWidgets() }
  }

  private fun context(): Context =
    appContext.reactContext
      ?: throw CodedException("ERR_WIDGET_BRIDGE", "No Android context.", null)

  private fun prefs() = context().getSharedPreferences(SHARED_PREFS, Context.MODE_PRIVATE)

  /**
   * Tell the provider to redraw. `AppWidgetManager.getAppWidgetIds` returns an
   * empty array when the user has placed none, and broadcasting to an empty
   * array is a no-op — so there is nothing to check first.
   */
  private fun notifyWidgets() {
    val context = context()
    val component = ComponentName(context.packageName, RECEIVER)
    val ids =
      try {
        AppWidgetManager.getInstance(context).getAppWidgetIds(component)
      } catch (e: IllegalArgumentException) {
        // The provider is not in this build (a variant without the widget).
        return
      }
    val intent =
      Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
        setComponent(component)
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
      }
    context.sendBroadcast(intent)
  }
}
