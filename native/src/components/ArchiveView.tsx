// The archive screen, mirroring src/ui/ArchiveView.tsx: archived items from
// every checklist, grouped under a header naming their source list, each
// offering Restore (back into its source list) and Delete (permanent). The
// archived groups come straight from the shared hook's `archivedGroups`.

import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { ArchivedGroup } from "../../../src/domain/checklists.ts";
import { useT } from "../../../src/i18n";
import { radius, spacing, useTokens } from "../theme.ts";
import { RowAction } from "./RowAction.tsx";

export function ArchiveView({
  groups,
  onRestore,
  onDelete,
}: {
  groups: ArchivedGroup[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const tokens = useTokens();

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: tokens.textMuted }]}>
          {t("nav.archiveEmpty")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={[styles.groupHeader, { color: tokens.textMuted }]}>
            {group.name}
          </Text>
          {group.items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.row,
                {
                  backgroundColor: tokens.surface,
                  borderColor: tokens.border,
                },
              ]}
            >
              <Text
                numberOfLines={2}
                style={[styles.title, { color: tokens.text }]}
              >
                {item.title}
              </Text>
              <RowAction
                label={t("nav.restore")}
                color={tokens.archive}
                onPress={() => onRestore(item.id)}
              />
              <RowAction
                label={t("app.delete")}
                color={tokens.danger}
                onPress={() => onDelete(item.id)}
              />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  groupHeader: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
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
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
});
