import { logger } from "../utils/logger";

export interface DiscoveredBridge {
  host: string;
  port: number;
  name: string;
}

export type DiscoveryCallback = (bridge: DiscoveredBridge) => void;

export interface DiscoveryHandle {
  stop: () => void;
}

export function startBridgeDiscovery(
  onFound: DiscoveryCallback,
  onTimeout?: () => void,
  timeoutMs: number = 15000
): DiscoveryHandle {
  let stopped = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let zeroconf: any = null;
  const foundNames = new Set<string>();

  try {
    const Zeroconf = require("react-native-zeroconf").default;
    zeroconf = new Zeroconf();
  } catch (e: any) {
    logger.warn("discovery", "react-native-zeroconf not available, mDNS disabled", { error: e.message });
    if (onTimeout) onTimeout();
    return { stop: () => {} };
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    try {
      zeroconf.removeDeviceListeners();
      zeroconf.stop();
    } catch (e) {
    }
    logger.info("discovery", "mDNS discovery stopped");
  };

  zeroconf.on("start", () => {
    logger.info("discovery", "mDNS scan started");
  });

  zeroconf.on("found", (service: any) => {
    if (stopped) return;
    if (!service || !service.name) return;
    foundNames.add(service.name);
    logger.info("discovery", "mDNS service found (not yet resolved)", { name: service.name });
  });

  zeroconf.on("resolved", (service: any) => {
    if (stopped) return;
    if (!service || !service.host) return;
    const bridge: DiscoveredBridge = {
      host: service.host,
      port: service.port || 3456,
      name: service.name || "OpenCode Bridge",
    };
    logger.info("discovery", "Bridge discovered via mDNS", bridge);
    onFound(bridge);
  });

  zeroconf.on("error", (err: any) => {
    logger.warn("discovery", "mDNS error", { error: String(err) });
  });

  timeoutHandle = setTimeout(() => {
    if (!stopped) {
      logger.info("discovery", "mDNS discovery timed out after " + timeoutMs + "ms", {
        foundButUnresolved: Array.from(foundNames),
      });
      if (foundNames.size > 0) {
        logger.warn("discovery", "Bridge(s) detected but could not resolve host — enter URL manually", {
          names: Array.from(foundNames),
        });
      }
      stop();
      if (onTimeout) onTimeout();
    }
  }, timeoutMs);

  try {
    zeroconf.scan("_opencode-bridge", "tcp", "local.");
    logger.info("discovery", "mDNS scan initiated for _opencode-bridge._tcp");
  } catch (e: any) {
    logger.warn("discovery", "mDNS scan failed", { error: e.message });
    if (timeoutHandle) clearTimeout(timeoutHandle);
    stop();
    if (onTimeout) onTimeout();
  }

  return { stop };
}