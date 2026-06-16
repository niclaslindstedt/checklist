import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  ModalBusContext,
  type ModalBus,
  type ModalCommand,
} from "./modal-bus.ts";

// Owns the single "active" bus command. A `dispatch` replaces it (only one
// bus modal is open at a time); `close` clears it. The consumer hooks and
// the command types live in `modal-bus.ts`.

export function ModalBusProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ModalCommand | null>(null);
  const dispatch = useCallback(
    (command: ModalCommand) => setActive(command),
    [],
  );
  const close = useCallback(() => setActive(null), []);
  const bus = useMemo<ModalBus>(
    () => ({ dispatch, active, close }),
    [dispatch, active, close],
  );
  return (
    <ModalBusContext.Provider value={bus}>{children}</ModalBusContext.Provider>
  );
}
