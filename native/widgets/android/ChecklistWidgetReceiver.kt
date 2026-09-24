// The Android Home Screen widget: the active list, at a glance.
//
// `expo prebuild` copies this file into the app module — see
// ../../plugins/withWidgets.js, which also registers the receiver on the
// generated manifest. It is a plain `AppWidgetProvider` drawing `RemoteViews`
// rather than a Glance widget: Glance is a Compose dependency the generated
// Gradle project does not carry, and everything this widget shows is four
// strings and a count.
//
// It only ever READS. The interactive check-off is an iOS App Intent (see
// ../../targets/widget/ChecklistIntents.swift); tapping here opens the app on
// the list instead, which needs no write path and no queue to drain.

package se.agilator.checklist.widget

// Rewritten to this build's application id by ../../plugins/withWidgets.js.
import dev.local.checklist.R

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

/** The preferences file the app publishes into; mirrors the iOS App Group. */
private const val SHARED_PREFS = "group.se.agilator.checklist"
private const val SNAPSHOT_KEY = "widget_snapshot"

/** How many open items fit before the widget stops listing them. */
private const val MAX_ITEMS = 3

class ChecklistWidgetReceiver : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    manager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (id in appWidgetIds) {
      manager.updateAppWidget(id, render(context))
    }
  }

  private fun render(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.checklist_widget)
    val active = activeList(context)

    if (active == null) {
      // No snapshot yet (fresh install, or no list chosen) — a calm empty
      // state rather than a widget that looks broken.
      views.setTextViewText(R.id.widget_list_name, "Checklist")
      views.setTextViewText(R.id.widget_progress, "Open the app to get started")
      for (slot in itemSlots) {
        views.setViewVisibility(slot, android.view.View.GONE)
      }
    } else {
      val total = active.optInt("total")
      val checked = active.optInt("checked")
      views.setTextViewText(R.id.widget_list_name, active.optString("name"))
      views.setTextViewText(R.id.widget_progress, "$checked of $total done")

      val open = active.optJSONArray("open")
      for ((index, slot) in itemSlots.withIndex()) {
        val item = if (open != null && index < open.length()) open.optJSONObject(index) else null
        if (item == null) {
          views.setViewVisibility(slot, android.view.View.GONE)
        } else {
          views.setViewVisibility(slot, android.view.View.VISIBLE)
          views.setTextViewText(slot, "• " + item.optString("title"))
        }
      }
    }

    views.setOnClickPendingIntent(R.id.widget_root, openApp(context))
    return views
  }

  private val itemSlots =
    listOf(R.id.widget_item_1, R.id.widget_item_2, R.id.widget_item_3)

  /** The `active` object of the published snapshot, or null when there is none. */
  private fun activeList(context: Context): JSONObject? {
    val json =
      context
        .getSharedPreferences(SHARED_PREFS, Context.MODE_PRIVATE)
        .getString(SNAPSHOT_KEY, null)
        ?: return null
    return try {
      JSONObject(json).optJSONObject("active")
    } catch (e: org.json.JSONException) {
      // A snapshot this build cannot parse is the app's problem to fix, not
      // something to crash the launcher over.
      null
    }
  }

  private fun openApp(context: Context): PendingIntent {
    // The app's URL scheme is its bundle id (app.config.js's `scheme`), which
    // on Android is the package name — so it is asked for, never spelled.
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse("${context.packageName}://")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
