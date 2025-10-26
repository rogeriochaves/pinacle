export const LAST_HEARTBEAT_THRESHOLD = 1000 * 60; // 60 seconds
export const STARTUP_GRACE_PERIOD = 1000 * 60 * 2; // 2 minutes

/**
 * Determines if a server is currently online based on its status and last heartbeat.
 * A server is considered online if:
 * 1. Its status is marked as "online" in the database
 * 2. It has sent a heartbeat within the last 60 seconds
 */
export const isServerOnline = (
  status: string,
  lastHeartbeatAt: Date | null,
): boolean => {
  return (
    status === "online" &&
    lastHeartbeatAt !== null &&
    lastHeartbeatAt > new Date(Date.now() - LAST_HEARTBEAT_THRESHOLD)
  );
};

/**
 * Gets the display status of a server ("Online" or "Offline")
 */
export const getServerDisplayStatus = (
  status: string,
  lastHeartbeatAt: Date | null,
): "Online" | "Offline" => {
  return isServerOnline(status, lastHeartbeatAt) ? "Online" : "Offline";
};

/**
 * Determines if a pod is actually running based on its status and last heartbeat.
 * A pod is considered running if:
 * 1. Its status is marked as "running" in the database
 * 2. It has sent a heartbeat within the last 60 seconds OR
 * 3. It was started within the last 2 minutes (grace period for first heartbeat)
 */
export const isPodActuallyRunning = (
  status: string,
  lastHeartbeatAt: Date | null,
  lastStartedAt: Date | null,
): boolean => {
  if (status !== "running") {
    return false;
  }

  const now = Date.now();

  // Check if within startup grace period
  if (lastStartedAt) {
    const timeSinceStart = now - lastStartedAt.getTime();
    if (timeSinceStart <= STARTUP_GRACE_PERIOD) {
      return true; // Still in grace period, consider it running
    }
  }

  // Outside grace period, must have recent heartbeat
  if (!lastHeartbeatAt) {
    return false;
  }

  const timeSinceHeartbeat = now - lastHeartbeatAt.getTime();
  return timeSinceHeartbeat <= LAST_HEARTBEAT_THRESHOLD;
};

/**
 * Gets the computed status of a pod, accounting for stale heartbeats.
 * Returns "stopped" if pod is marked as running but has no recent heartbeat.
 */
export const getPodComputedStatus = (
  status: string,
  lastHeartbeatAt: Date | null,
  lastStartedAt: Date | null,
): string => {
  if (status === "running" && !isPodActuallyRunning(status, lastHeartbeatAt, lastStartedAt)) {
    return "stopped";
  }
  return status;
};

