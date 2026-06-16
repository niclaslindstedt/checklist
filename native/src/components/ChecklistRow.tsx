// One item line. Faithful to src/ui/ChecklistRow.tsx's actions — toggle,
// archive (hide without destroying), delete (recoverable via undo) — but
// the web row reveals archive/delete through a swipe gesture; here they are
// explicit trailing buttons so the native app needs no gesture-handler
// dependency yet. Swapping in swipe-to-reveal later is a row-local change.

import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ChecklistItem } from "../../../src/domain/types.ts";
import { useT } from "../../../src/i18n";
import { Checkbox } from "./Checkbox.tsx";
import { radius, spacing, useTokens } from "../theme.ts";

function ChecklistRowImpl({
  item,
  onToggle,
  onArchive,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const tokens = useTokens();

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Checkbox
        checked={item.checked}
        onToggle={() => onToggle(item.id)}
        accessibilityLabel={item.checked ? t("app.uncheck") : t("app.check")}
      />
      <Text
        numberOfLines={2}
        style={[
          styles.title,
          {
            color: item.checked ? tokens.textMuted : tokens.text,
            textDecorationLine: item.checked ? "line-through" : "none",
          },
        ]}
      >
        {item.title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.archive")}
        hitSlop={6}
        onPress={() => onArchive(item.id)}
        style={styles.action}
      >
        <Text style={[styles.actionText, { color: tokens.archive }]}>
          {t("app.archive")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("app.delete")}
        hitSlop={6}
        onPress={() => onDelete(item.id)}
        style={styles.action}
      >
        <Text style={[styles.actionText, { color: tokens.danger }]}>
          {t("app.delete")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  action: {
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

// Memoised so editing one row doesn't reconcile the whole list — the edit
// verbs in the shared hook keep stable identities precisely so this works.
export const ChecklistRow = memo(ChecklistRowImpl);
