import { useChecklistContext } from "../../ui/checklist-context.ts";
import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the reset-schedule sheet's open state; opens on a "reset-schedule"
// command from the modal bus (the clock on a sidebar row's swipe strip, or
// the desktop right-click entry), which names the list to schedule. The list
// itself is resolved from the live document so the sheet always prefills the
// schedule as currently stored; a list deleted from under an open sheet just
// closes it.
//
// Deferred: a user who never schedules a list never loads the chunk.
const ResetScheduleModal = defer(() =>
  import("../../ui/ResetScheduleModal.tsx").then((m) => m.ResetScheduleModal),
);

export function ResetScheduleModalHost() {
  const { command, close } = useModalState("reset-schedule");
  const { snapshot, setChecklistResetSchedule } = useChecklistContext();
  const list = command
    ? (snapshot.checklists.find((c) => c.id === command.checklistId) ?? null)
    : null;
  if (!list) return null;
  return (
    <ResetScheduleModal
      key={list.id}
      active
      list={list}
      onSubmit={(schedule) => setChecklistResetSchedule(list.id, schedule)}
      onClose={close}
    />
  );
}
