// The inline composer, mirroring src/ui/AddItemForm.tsx's feel: submitting
// adds the item, clears the field, and keeps focus so the user can type item
// after item without re-tapping. An empty submit is ignored (the shared
// `addItem` verb trims and drops blanks too).

import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useT } from "../../../src/i18n";
import { radius, spacing, useTokens } from "../theme.ts";

export function AddItemBar({ onAdd }: { onAdd: (title: string) => void }) {
  const t = useT();
  const tokens = useTokens();
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue("");
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        blurOnSubmit={false}
        returnKeyType="done"
        placeholder={t("app.addItemPlaceholder")}
        placeholderTextColor={tokens.textMuted}
        accessibilityLabel={t("app.addItem")}
        style={[
          styles.input,
          { color: tokens.text, backgroundColor: tokens.surfaceAlt },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
});
