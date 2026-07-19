import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Server, {
  getActiveServer,
  STATES,
} from "@dr.pogodin/react-native-static-server";
import { prepareWebroot } from "./webroot";

// The origin must stay byte-identical across launches: a web origin is
// scheme + host + PORT, so letting the server pick a free port (its default)
// would hand the WebView a brand-new origin every restart — and with it an
// empty localStorage. Every checklist the user owns lives in localStorage,
// so an unstable port silently wipes the app on each launch.
//
// The ladder exists only for the rare case where something else already
// holds the port. Falling back to a *deterministic* neighbour keeps the
// origin stable in the common case; falling back to port 0 would not.
const PORT_LADDER = [8791, 8792, 8793] as const;

// Load the page from `localhost`, NOT the literal `127.0.0.1`, even though the
// server binds to the loopback address. Apple DTS (developer.apple.com/forums/
// thread/6205) reports that App Transport Security blocks `http://127.0.0.1:…`
// from WKWebView while `http://localhost:…` is permitted, even with exception
// domains declared for both. The failure mode is a silent blank page on iOS.
//
// This also fixes the *origin*, which is why it must be settled before the app
// ships: `localStorage` is keyed by origin, so changing the hostname later
// would orphan every checklist already on the device.
const HOSTNAME = "localhost";

export type ServerState =
  | { status: "starting" }
  | { status: "ready"; origin: string }
  | { status: "failed"; error: Error };

// The server reports its origin as `http://127.0.0.1:<port>`; the WebView must
// address the same server as `http://localhost:<port>` (see HOSTNAME).
const originForPort = (port: number) => `http://${HOSTNAME}:${port}`;

async function startOnFirstFreePort(fileDir: string): Promise<Server> {
  let lastError: unknown;
  for (const port of PORT_LADDER) {
    const server = new Server({
      // Bind to the loopback interface only — `nonLocal` stays false so the
      // bundle is never reachable from the LAN. The WebView still addresses it
      // as `localhost` (see HOSTNAME above).
      fileDir,
      port,
      hostname: "127.0.0.1",
      // iOS closes listening sockets after a stretch in the background, so
      // the server is torn down and restarted around the transition. Android
      // survives backgrounding fine, and the library's timed variant misfires
      // there (the stop only arrives on resume, causing a pointless cycle).
      stopInBackground: Platform.OS === "ios",
    });
    try {
      await server.start();
      return server;
    } catch (error) {
      lastError = error;
      await server.stop().catch(() => {});
    }
  }
  throw new Error(
    `Could not bind the embedded web server to any of ${PORT_LADDER.join(", ")}: ${String(lastError)}`,
  );
}

/**
 * Starts the embedded static server once for the lifetime of the app and
 * returns the origin to point the WebView at.
 *
 * Deliberately owned by the root component: the library allows only one
 * server instance per process, and an un-awaited `stop()` does not guarantee
 * shutdown — so a hook that remounted (navigation churn, Fast Refresh) would
 * fail to rebind.
 */
export function useStaticServer(): ServerState {
  const [state, setState] = useState<ServerState>({ status: "starting" });
  const serverRef = useRef<Server | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        // Survives Fast Refresh, which re-runs this effect without tearing
        // the native module down.
        const running = getActiveServer();
        if (running && running.state === STATES.ACTIVE) {
          serverRef.current = running;
          if (alive)
            setState({ status: "ready", origin: originForPort(running.port) });
          return;
        }

        const fileDir = await prepareWebroot();
        const server = await startOnFirstFreePort(fileDir);
        serverRef.current = server;
        if (alive)
          setState({ status: "ready", origin: originForPort(server.port) });
      } catch (error) {
        if (alive) {
          setState({
            status: "failed",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();

    return () => {
      alive = false;
      void serverRef.current?.stop();
    };
  }, []);

  return state;
}
