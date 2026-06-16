// The square check control on each row, mirroring src/ui/form/Checkbox.tsx:
// an outlined box that fills with the accent and shows a tick when checked.

import { Pressable, StyleSheet, Text } from "react-native";

import { useTokens } from "../theme.ts";

export function Checkbox({
  checked,
  onToggle,
  accessibilityLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onToggle}
      style={[
        styles.box,
        {
          borderColor: checked ? t.accent : t.border,
          backgroundColor: checked ? t.accent : "transparent",
        },
      ]}
    >
      {checked ? (
        <Text style={[styles.tick, { color: t.accentText }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 18,
  },
});
