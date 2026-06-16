// A single transient banner pinned near the bottom — the native stand-in for
// the web toast stack (src/ui/toast). App feeds it the latest message raised
// through the shared `notify` sink (deletes, archives, undo/redo); it fades
// itself out after a moment.

import { StyleSheet, Text, View } from "react-native";

import { radius, spacing, useTokens } from "../theme.ts";

export function Toast({ message }: { message: string | null }) {
  const tokens = useTokens();
  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View
        style={[
          styles.toast,
          { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
        ]}
      >
        <Text numberOfLines={2} style={[styles.text, { color: tokens.text }]}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  toast: {
    maxWidth: 420,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 14,
  },
});
