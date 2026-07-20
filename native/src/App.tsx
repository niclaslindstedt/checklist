import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
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

// Hold the native splash until the WebView actually paints (see the timeout
// below). Called at module scope so the auto-hide never wins the race; the
// promise is ignored because a rejection only means the splash was already
// gone, which is harmless.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Ceiling on how long the splash may stay up. The happy path hides it on the
// WebView's first paint; this only fires when a load hangs, so a broken start
// falls through to the spinner or the error screen instead of stranding the
// user on the splash forever.
const SPLASH_TIMEOUT_MS = 10000;

export default function App() {
  const { state: server, retry } = useStaticServer();
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

  // Hide the native splash exactly once. The server being up says nothing about
  // the page having painted, so this is driven off the WebView's `onLoadEnd`
  // (first paint), the failure screen, and the timeout — never off server start.
  const splashHidden = useRef(false);
  const hideSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // If the server never comes up there is no WebView to paint, so drop the
  // splash to reveal the error screen (with its Try again).
  useEffect(() => {
    if (server.status === "failed") hideSplash();
  }, [server.status, hideSplash]);

  useEffect(() => {
    if (server.status === "ready") setOrigin(server.origin);
  }, [server]);

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
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
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
            // First paint of the embedded app: the one moment the splash can
            // hide onto real content.
            onLoadEnd={hideSplash}
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
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2f3d4a",
  },
  retryButtonPressed: { backgroundColor: "#3b4c5c" },
  retryLabel: { color: "#e8eef2", fontSize: 15, fontWeight: "600" },
});
