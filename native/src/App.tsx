import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";
import { useStaticServer } from "./useStaticServer";
import { useNativeBridge } from "./nativeBridge";
import { useNativeTheme } from "./nativeTheme";

// Fallback chrome shown before the page reports its theme (startup, over-scroll,
// the server-failed screen). Matches the dark preset so nothing flashes white;
// once the WebView paints, `useNativeTheme` takes over with the live theme.
const BACKGROUND = "#1f2933";

export default function App() {
  const server = useStaticServer();
  const webViewRef = useRef<WebView>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const canGoBack = useRef(false);

  // The native ↔ web bridge: injects `window.__native` (the iCloud key-value
  // backend the web app feature-detects) and answers its calls over
  // `postMessage`. A no-op surface on Android / when iCloud is unavailable.
  const { injectedJavaScriptBeforeContentLoaded, onMessage: onBridgeMessage } =
    useNativeBridge(webViewRef);

  // Propagate the web app's resolved theme onto the native chrome so the
  // status bar and safe-area bands follow the picker instead of the dark
  // constant above. `theme` is null until the page reports one.
  const { injectedJavaScript, theme, onThemeMessage } = useNativeTheme();

  // One `onMessage` feeds both channels: theme reports are consumed here, and
  // everything else (the `window.__native` bridge traffic) falls through.
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (onThemeMessage(event)) return;
      onBridgeMessage(event);
    },
    [onThemeMessage, onBridgeMessage],
  );

  const background = theme?.background ?? BACKGROUND;
  const barStyle = theme?.barStyle ?? "light";

  useEffect(() => {
    if (server.status === "ready") setOrigin(server.origin);
  }, [server]);

  // iOS tears the server down in the background (see `useStaticServer`). If
  // it came back on a different port the loaded page is pointing at a dead
  // origin, so reload once the origin we hold has actually changed.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (server.status !== "ready") return;
      if (origin && server.origin !== origin) {
        setOrigin(server.origin);
      }
    });
    return () => sub.remove();
  }, [server, origin]);

  // The app navigates within its own origin in a few places — the privacy
  // page linked from the side menu is a separate document, not a modal — so
  // the wrapper has to provide the "back" the browser chrome would. Android
  // routes the hardware button; iOS gets the edge-swipe via
  // `allowsBackForwardNavigationGestures`. Without this the privacy link is
  // a dead end with no way back to the checklist.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false; // fall through: exit the app
      webViewRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Keep the WebView on the embedded app. Anything else — a Drive or Dropbox
  // OAuth page, a link in an item note — belongs in the system browser, both
  // because OAuth inside an embedded WebView is blocked by the providers and
  // because App Review expects external links to open externally.
  const onShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation) => {
      if (!origin) return false;
      if (request.url.startsWith(origin)) return true;
      if (request.url.startsWith("about:")) return true;
      void Linking.openURL(request.url);
      return false;
    },
    [origin],
  );

  if (server.status === "failed") {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <StatusBar style="light" />
          <Text style={styles.errorTitle}>Could not start checklist</Text>
          <Text style={styles.errorBody}>{server.error.message}</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.fill, { backgroundColor: background }]}
        edges={["top", "bottom"]}
      >
        <StatusBar style={barStyle} />
        {origin ? (
          <WebView
            ref={webViewRef}
            source={{ uri: origin }}
            originWhitelist={["http://localhost:*"]}
            style={[styles.fill, { backgroundColor: background }]}
            javaScriptEnabled
            // Android: without this localStorage is unavailable entirely.
            domStorageEnabled
            // Never set `incognito` — it makes WKWebView storage
            // non-persistent, which would drop every checklist on exit.
            incognito={false}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            // Native bridge: expose `window.__native` before the page loads,
            // and answer its `postMessage` calls (see `nativeBridge.ts`).
            injectedJavaScriptBeforeContentLoaded={
              injectedJavaScriptBeforeContentLoaded
            }
            // Report the resolved theme (page background + status-bar style)
            // to native after the page paints, and on every live theme switch.
            injectedJavaScript={injectedJavaScript}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={(nav) => {
              canGoBack.current = nav.canGoBack;
            }}
            // The app draws its own scroll surfaces; bouncing the WebView
            // itself exposes the native background behind the layout.
            bounces={false}
            overScrollMode="never"
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#8fa3b0" />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BACKGROUND },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BACKGROUND,
    padding: 24,
  },
  errorTitle: {
    color: "#e8eef2",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  errorBody: { color: "#8fa3b0", fontSize: 14, textAlign: "center" },
});
