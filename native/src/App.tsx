// Root of the React Native app. It is deliberately thin: all of the state,
// persistence, undo/redo and domain logic come from the shared `useChecklist`
// hook under ../../src/app — the very same code the web PWA runs. This file
// only wires that surface to native views and owns the small bits of
// screen-local UI state (which view is showing, the switcher sheet, the
// transient toast).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import type { Notify } from "../../src/app/notify.ts";
import { useChecklist } from "../../src/app/use-checklist.ts";
import { useT } from "../../src/i18n";

import { AddItemBar } from "./components/AddItemBar.tsx";
import { ArchiveView } from "./components/ArchiveView.tsx";
import { ChecklistRow } from "./components/ChecklistRow.tsx";
import { Header } from "./components/Header.tsx";
import { ListSwitcher } from "./components/ListSwitcher.tsx";
import { Toast } from "./components/Toast.tsx";
import { NativeLanguageProvider } from "./i18n/NativeLanguageProvider.tsx";
import {
  availableBackends,
  backendById,
  type NativeBackendId,
} from "./storage/backends.ts";
import {
  loadBackendPreference,
  saveBackendPreference,
} from "./storage/backendPreference.ts";
import { spacing, useTokens } from "./theme.ts";

const TOAST_MS = 2600;

function AppInner() {
  const t = useT();
  const tokens = useTokens();

  // Which storage backend is active. Starts on the on-device default and is
  // reconciled with the persisted choice once it loads from AsyncStorage.
  // The set of options is platform-gated: `availableBackends()` only includes
  // iCloud on iOS, so the picker below is empty everywhere else.
  const backends = useMemo(() => availableBackends(), []);
  const [backendId, setBackendId] = useState<NativeBackendId>("browser");

  useEffect(() => {
    let cancelled = false;
    void loadBackendPreference().then((id) => {
      if (!cancelled) setBackendId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectBackend = useCallback((id: NativeBackendId) => {
    setBackendId(id);
    void saveBackendPreference(id);
  }, []);

  // The active backend instance. Rebuilt when the choice changes so the sync
  // engine — which reloads on adapter identity change — picks up the new
  // backend's document.
  const adapter = useMemo(() => backendById(backendId).create(), [backendId]);

  // The transient action banner. `notify` is the sink the shared edit verbs
  // call for results the user can't otherwise see (delete, archive, undo…).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback<Notify>((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const cl = useChecklist(adapter, "bottom", notify);

  // Live cross-device sync: backends that push remote changes (iCloud, via
  // its `watch` capability) wake the app so another device's edit appears
  // without a manual refresh. Backends without `watch` (the on-device one)
  // skip this entirely.
  const reload = cl.reload;
  useEffect(() => {
    if (!adapter.watch) return;
    return adapter.watch(() => {
      void reload();
    });
  }, [adapter, reload]);

  const [view, setView] = useState<"checklist" | "archive">("checklist");
  const [menuOpen, setMenuOpen] = useState(false);

  const archivedCount = useMemo(
    () => cl.archivedGroups.reduce((n, g) => n + g.items.length, 0),
    [cl.archivedGroups],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: tokens.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {view === "checklist" ? (
          <>
            <Header
              name={cl.activeList.name}
              checkedCount={cl.checkedCount}
              total={cl.items.length}
              onRename={(name) =>
                cl.renameChecklist(cl.activeChecklistId, name)
              }
              onOpenMenu={() => setMenuOpen(true)}
            />
            <FlatList
              data={cl.items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <ChecklistRow
                  item={item}
                  onToggle={cl.toggle}
                  onArchive={cl.archive}
                  onDelete={cl.remove}
                />
              )}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: tokens.textMuted }]}>
                  {t("app.empty")}
                </Text>
              }
            />
            <AddItemBar onAdd={cl.addItem} />
          </>
        ) : (
          <>
            <View style={[styles.archiveBar, { borderColor: tokens.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={8}
                onPress={() => setView("checklist")}
              >
                <Text style={[styles.back, { color: tokens.accent }]}>
                  ‹ {t("nav.checklist")}
                </Text>
              </Pressable>
              <Text style={[styles.archiveTitle, { color: tokens.text }]}>
                {t("nav.archive")}
              </Text>
            </View>
            <ArchiveView
              groups={cl.archivedGroups}
              onRestore={cl.unarchive}
              onDelete={cl.remove}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <ListSwitcher
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        checklists={cl.checklists}
        activeId={cl.activeChecklistId}
        onSelect={cl.selectChecklist}
        onAdd={cl.addChecklist}
        onRemove={cl.removeChecklist}
        archivedCount={archivedCount}
        onOpenArchive={() => setView("archive")}
        backends={backends}
        activeBackendId={backendId}
        onSelectBackend={selectBackend}
        canUndo={cl.canUndo}
        canRedo={cl.canRedo}
        onUndo={cl.undo}
        onRedo={cl.redo}
      />

      <Toast message={toast} />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NativeLanguageProvider>
        <AppInner />
      </NativeLanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  empty: {
    textAlign: "center",
    marginTop: spacing.xl,
    fontSize: 15,
  },
  archiveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: {
    fontSize: 16,
    fontWeight: "600",
  },
  archiveTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
});
