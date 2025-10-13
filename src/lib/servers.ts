import { and, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { servers } from "./db/schema";
import { LAST_HEARTBEAT_THRESHOLD } from "./server-status";

export const getNextAvailableServer = async () => {
  const [availableServer] = await db
    .select()
    .from(servers)
    .where(getAvailableServersCondition())
    .limit(1);

  return availableServer;
};

export const getAvailableServersCondition = () => {
  return and(
    eq(servers.status, "online"),
    gte(
      servers.lastHeartbeatAt,
      new Date(Date.now() - LAST_HEARTBEAT_THRESHOLD),
    ),
  );
};
