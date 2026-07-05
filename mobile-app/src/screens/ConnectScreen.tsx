import React, { useState, useEffect } from "react";
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
import { Colors, Spacing, FontSizes, BorderRadii } from "../constants/theme";
import { useAppStore } from "../store/appStore";
import { logger } from "../utils/logger";

export default function ConnectScreen() {
  const [bridgeUrl, setBridgeUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const { setConnection } = useAppStore();

  useEffect(() => {
    logger.info("screen", "ConnectScreen mounted");
    setBridgeUrl("http://192.168.");
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
      logger.error("screen", "Connection failed", { error: e.message, url });
      Alert.alert(
        "Connection Failed",
        e.message || "Could not connect to the OpenCode bridge. Make sure it's running and the URL/key are correct."
      );
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.label}>Bridge URL</Text>
          <Text style={styles.hint}>
            Your laptop's IP address with port 3456 (e.g. http://192.168.1.100:3456)
          </Text>
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
            Found in your bridge console or control panel
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