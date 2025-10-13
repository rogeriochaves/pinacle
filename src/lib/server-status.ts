export const LAST_HEARTBEAT_THRESHOLD = 1000 * 60;

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

