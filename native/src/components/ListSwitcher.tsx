// The native stand-in for src/ui/SideMenu.tsx: a slide-up sheet listing the
// document's checklists (tap to switch, trailing Delete unless it's the last
// one), a "new checklist" action, the Archive view, and Undo / Redo. It is
// driven entirely by the shared `useChecklist` surface passed down from App.

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ChecklistSummary } from "../../../src/app/use-checklist.ts";
import { useT } from "../../../src/i18n";
import { radius, spacing, useTokens } from "../theme.ts";

export function ListSwitcher({
  visible,
  onClose,
  checklists,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  archivedCount,
  onOpenArchive,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  visible: boolean;
  onClose: () => void;
  checklists: ChecklistSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  archivedCount: number;
  onOpenArchive: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const tokens = useTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: tokens.surface, borderColor: tokens.border },
        ]}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.heading, { color: tokens.text }]}>
            {t("nav.checklists")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={8}
            onPress={onClose}
          >
            <Text style={[styles.close, { color: tokens.textMuted }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView>
          {checklists.map((c) => {
            const isActive = c.id === activeId;
            return (
              <View key={c.id} style={styles.listRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.listRowMain}
                  onPress={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.listName,
                      {
                        color: isActive ? tokens.accent : tokens.text,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {c.name}
                  </Text>
                  {c.remaining > 0 ? (
                    <Text
                      style={[
                        styles.badge,
                        {
                          color: tokens.textMuted,
                          backgroundColor: tokens.surfaceAlt,
                        },
                      ]}
                    >
                      {c.remaining}
                    </Text>
                  ) : null}
                </Pressable>
                {checklists.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("nav.removeChecklist")}
                    hitSlop={6}
                    onPress={() => onRemove(c.id)}
                  >
                    <Text style={[styles.rowAction, { color: tokens.danger }]}>
                      {t("app.delete")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            style={styles.footerRow}
            onPress={() => {
              onAdd();
              onClose();
            }}
          >
            <Text style={[styles.footerAction, { color: tokens.accent }]}>
              + {t("nav.newChecklist")}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: tokens.border }]} />

          <Pressable
            accessibilityRole="button"
            style={[styles.listRow, styles.listRowMain]}
            onPress={() => {
              onOpenArchive();
              onClose();
            }}
          >
            <Text style={[styles.listName, { color: tokens.text }]}>
              {t("nav.archive")}
            </Text>
            {archivedCount > 0 ? (
              <Text
                style={[
                  styles.badge,
                  {
                    color: tokens.textMuted,
                    backgroundColor: tokens.surfaceAlt,
                  },
                ]}
              >
                {archivedCount}
              </Text>
            ) : null}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: tokens.border }]} />

          <View style={styles.undoRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("nav.undo")}
              disabled={!canUndo}
              onPress={onUndo}
              style={styles.undoButton}
            >
              <Text
                style={[
                  styles.footerAction,
                  { color: canUndo ? tokens.text : tokens.textMuted },
                ]}
              >
                ↶ {t("nav.undo")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("nav.redo")}
              disabled={!canRedo}
              onPress={onRedo}
              style={styles.undoButton}
            >
              <Text
                style={[
                  styles.footerAction,
                  { color: canRedo ? tokens.text : tokens.textMuted },
                ]}
              >
                ↷ {t("nav.redo")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.lg,
  },
  heading: {
    fontSize: 18,
    fontWeight: "700",
  },
  close: {
    fontSize: 18,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  listRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  listName: {
    flexShrink: 1,
    fontSize: 16,
  },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 22,
    textAlign: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  rowAction: {
    fontSize: 13,
    fontWeight: "600",
  },
  footerRow: {
    paddingVertical: spacing.md,
  },
  footerAction: {
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  undoRow: {
    flexDirection: "row",
    gap: spacing.xl,
    paddingVertical: spacing.md,
  },
  undoButton: {
    paddingVertical: spacing.xs,
  },
});
