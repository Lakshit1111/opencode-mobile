import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { logger } from "../utils/logger";
import { RootStackParamList } from "../App";
import { startBridgeDiscovery, type DiscoveredBridge, type DiscoveryHandle } from "../api/discovery";

type Props = NativeStackScreenProps<RootStackParamList, "Connect">;

export default function ConnectScreen({ navigation }: Props) {
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(true);
  const [discoveredBridge, setDiscoveredBridge] = useState<DiscoveredBridge | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const { setConnection } = useAppStore();
  const discoveryRef = useRef<DiscoveryHandle | null>(null);
  const foundRef = useRef(false);

  useEffect(() => {
    logger.info("screen", "ConnectScreen mounted, starting mDNS discovery");
    setBridgeUrl("http://192.168.");
    setDiscovering(true);
    foundRef.current = false;

    discoveryRef.current = startBridgeDiscovery(
      (bridge) => {
        if (discoveryRef.current === null) return;
        if (foundRef.current) return;
        foundRef.current = true;
        logger.info("screen", "Bridge auto-discovered", bridge);
        setDiscoveredBridge(bridge);
        setBridgeUrl(`http://${bridge.host}:${bridge.port}`);
        setDiscovering(false);
        setManualMode(false);
      },
      () => {
        logger.info("screen", "mDNS discovery timed out, switching to manual mode");
        setDiscovering(false);
        if (!foundRef.current) setManualMode(true);
      },
      5000
    );

    return () => {
      if (discoveryRef.current) {
        discoveryRef.current.stop();
        discoveryRef.current = null;
      }
    };
  }, []);

  const handleConnect = async () => {
    if (!bridgeUrl.trim()) {
      Alert.alert("Error", "Please enter your laptop's bridge URL");
      return;
    }
    if (!apiKey.trim()) {
      Alert.alert("Error", "Please enter your API key");
      return;
    }

    const url = bridgeUrl.trim().replace(/\/+$/, "");
    logger.info("screen", "Connect button pressed", { url, keyLength: apiKey.trim().length });
    setLoading(true);
    try {
      await setConnection({ bridgeUrl: url, apiKey: apiKey.trim() });
      logger.info("screen", "Connection successful");
    } catch (e: any) {
      logger.error("screen", "Connection failed", { error: e.message, url, stack: e.stack });
      Alert.alert(
        "Connection Failed",
        e.message || "Could not connect to the OpenCode bridge. Make sure it's running and the URL/key are correct.",
        [
          { text: "View Logs", onPress: () => navigation.navigate("Logs") },
          { text: "OK" },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const switchToManual = () => {
    if (discoveryRef.current) {
      discoveryRef.current.stop();
      discoveryRef.current = null;
    }
    setDiscovering(false);
    setManualMode(true);
    setDiscoveredBridge(null);
  };

  const retryDiscovery = () => {
    setManualMode(false);
    setDiscovering(true);
    setDiscoveredBridge(null);
    setBridgeUrl("http://192.168.");
    foundRef.current = false;
    if (discoveryRef.current) {
      discoveryRef.current.stop();
    }
    discoveryRef.current = startBridgeDiscovery(
      (bridge) => {
        if (discoveryRef.current === null) return;
        if (foundRef.current) return;
        foundRef.current = true;
        setDiscoveredBridge(bridge);
        setBridgeUrl(`http://${bridge.host}:${bridge.port}`);
        setDiscovering(false);
      },
      () => {
        setDiscovering(false);
        if (!foundRef.current) setManualMode(true);
      },
      5000
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>OC</Text>
          <Text style={styles.title}>OpenCode Mobile</Text>
          <Text style={styles.subtitle}>Connect to your local AI agent</Text>
        </View>

        <View style={styles.form}>
          {discovering && (
            <View style={styles.discoveringBox}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <Text style={styles.discoveringText}>Searching for OpenCode Bridge...</Text>
              <Text style={styles.discoveringHint}>
                Make sure the bridge is running on your laptop and you're on the same Wi-Fi network
              </Text>
              <TouchableOpacity style={styles.manualLink} onPress={switchToManual}>
                <Text style={styles.manualLinkText}>Enter manually instead</Text>
              </TouchableOpacity>
            </View>
          )}

          {!discovering && (
            <>
              {discoveredBridge && !manualMode && (
                <View style={styles.discoveredBox}>
                  <Text style={styles.discoveredLabel}>Bridge Found</Text>
                  <Text style={styles.discoveredName} numberOfLines={1}>{discoveredBridge.name}</Text>
                  <Text style={styles.discoveredHost}>{bridgeUrl}</Text>
                </View>
              )}

              {manualMode && (
                <>
                  <Text style={styles.label}>Bridge URL</Text>
                  <Text style={styles.hint}>
                    Your laptop's IP address with port 3456 (e.g. http://192.168.1.100:3456)
                  </Text>
                </>
              )}

              {!manualMode && discoveredBridge && (
                <>
                  <Text style={styles.label}>Bridge URL</Text>
                  <Text style={styles.hint}>Auto-discovered via mDNS — you can edit if needed</Text>
                </>
              )}

              {!discovering && (
                <>
                  <TextInput
                    style={styles.input}
                    value={bridgeUrl}
                    onChangeText={setBridgeUrl}
                    placeholder="http://192.168.1.100:3456"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />

                  <Text style={styles.label}>API Key</Text>
                  <Text style={styles.hint}>
                    Found in your bridge control panel (http://localhost:3456 → Settings)
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="oc-mobile-..."
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />

                  <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleConnect}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Connect</Text>
                    )}
                  </TouchableOpacity>

                  {manualMode && (
                    <TouchableOpacity style={styles.retryLink} onPress={retryDiscovery}>
                      <Text style={styles.retryLinkText}>Try auto-discover again</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.logsButton}
                    onPress={() => navigation.navigate("Logs")}
                  >
                    <Text style={styles.logsButtonText}>View Logs</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Make sure the mobile bridge is running on your laptop
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  logo: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.dark.primary,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.dark.textSecondary,
  },
  form: {
    gap: Spacing.md,
  },
  discoveringBox: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  discoveringText: {
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  discoveringHint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
  manualLink: {
    marginTop: Spacing.sm,
  },
  manualLinkText: {
    color: Colors.dark.accent,
    fontSize: FontSizes.sm,
    fontWeight: "500",
  },
  discoveredBox: {
    backgroundColor: "#1b3a1b",
    borderRadius: BorderRadii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.success,
  },
  discoveredLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.dark.success,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  discoveredName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  discoveredHost: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textSecondary,
    fontFamily: "monospace",
  },
  label: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.md,
    padding: Spacing.lg,
    fontSize: FontSizes.md,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  button: {
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadii.md,
    padding: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: FontSizes.lg,
    fontWeight: "600",
  },
  retryLink: {
    marginTop: Spacing.md,
    padding: Spacing.sm,
    alignItems: "center",
  },
  retryLinkText: {
    color: Colors.dark.accent,
    fontSize: FontSizes.sm,
    fontWeight: "500",
  },
  logsButton: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadii.md,
  },
  logsButtonText: {
    color: Colors.dark.accent,
    fontSize: FontSizes.md,
    fontWeight: "500",
  },
  footer: {
    marginTop: Spacing.xxl,
    alignItems: "center",
  },
  footerText: {
    fontSize: FontSizes.sm,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
});