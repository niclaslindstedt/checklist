// The pinned header: the active checklist's name (tap to rename inline, like
// src/ui/ChecklistTitle.tsx), the checked/total progress count, and a button
// that opens the list switcher (the native stand-in for the side menu).

import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useT } from "../../../src/i18n";
import { radius, spacing, useTokens } from "../theme.ts";

export function Header({
  name,
  checkedCount,
  total,
  onRename,
  onOpenMenu,
}: {
  name: string;
  checkedCount: number;
  total: number;
  onRename: (name: string) => void;
  onOpenMenu: () => void;
}) {
  const t = useT();
  const tokens = useTokens();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <View style={[styles.header, { borderColor: tokens.border }]}>
      <View style={styles.titleWrap}>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            autoFocus
            returnKeyType="done"
            accessibilityLabel={t("app.renameChecklist")}
            style={[
              styles.titleInput,
              { color: tokens.text, borderColor: tokens.accent },
            ]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("app.renameChecklist")}
            onPress={startEditing}
          >
            <Text
              numberOfLines={1}
              style={[styles.title, { color: tokens.text }]}
            >
              {name}
            </Text>
          </Pressable>
        )}
        <Text style={[styles.count, { color: tokens.textMuted }]}>
          {checkedCount}/{total}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("nav.open")}
        hitSlop={8}
        onPress={onOpenMenu}
        style={[styles.menuButton, { backgroundColor: tokens.surfaceAlt }]}
      >
        <Text style={[styles.menuGlyph, { color: tokens.text }]}>☰</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  titleInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    borderBottomWidth: 2,
    paddingVertical: 2,
  },
  count: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  menuGlyph: {
    fontSize: 20,
    lineHeight: 22,
  },
});
