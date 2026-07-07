import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useAppStore } from "./store/appStore";
import { Colors } from "./constants/theme";
import { logger } from "./utils/logger";
import ConnectScreen from "./screens/ConnectScreen";
import DashboardScreen from "./screens/DashboardScreen";
import SessionScreen from "./screens/SessionScreen";
import FolderSessionsScreen from "./screens/FolderSessionsScreen";
import LogsScreen from "./screens/LogsScreen";

export type RootStackParamList = {
  Connect: undefined;
  Dashboard: undefined;
  FolderSessions: { directory: string };
  Session: { sessionID: string };
  Logs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { connection, loadSavedConnection, connected } = useAppStore();

  useEffect(() => {
    logger.info("app", "App mounted, loading saved connection");
    loadSavedConnection();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: Colors.dark.primary,
            background: Colors.dark.background,
            card: Colors.dark.surface,
            text: Colors.dark.text,
            border: Colors.dark.border,
            notification: Colors.dark.primary,
          },
          fonts: {
            regular: { fontFamily: "System", fontWeight: "400" } as any,
            medium: { fontFamily: "System", fontWeight: "500" } as any,
            bold: { fontFamily: "System", fontWeight: "700" } as any,
            heavy: { fontFamily: "System", fontWeight: "900" } as any,
          },
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: Colors.dark.surface },
            headerTintColor: Colors.dark.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: Colors.dark.background },
            headerTitleStyle: { fontWeight: "600" },
          }}
        >
          {connected && connection ? (
            <>
              <Stack.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{ title: "OpenCode", headerBackVisible: false }}
              />
              <Stack.Screen
                name="FolderSessions"
                component={FolderSessionsScreen}
                options={{ title: "Folder", headerBackTitle: "Back" }}
              />
              <Stack.Screen
                name="Session"
                component={SessionScreen}
                options={{ title: "Session", headerBackTitle: "Back" }}
              />
              <Stack.Screen
                name="Logs"
                component={LogsScreen}
                options={{ title: "Debug Logs", headerBackTitle: "Back" }}
              />
            </>
          ) : (
            <>
              <Stack.Screen
                name="Connect"
                component={ConnectScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Logs"
                component={LogsScreen}
                options={{ title: "Debug Logs", headerBackTitle: "Back" }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}