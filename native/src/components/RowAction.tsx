// A small text button used at the trailing edge of a row (archive view's
// Restore / Delete). Kept tiny and shared so the rows stay declarative.

import { Pressable, StyleSheet, Text } from "react-native";

import { spacing } from "../theme.ts";

export function RowAction({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={styles.action}
    >
      <Text style={[styles.text, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    paddingHorizontal: spacing.xs,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
});
