export declare class ServerAgent {
    private config;
    private metricsCollector;
    private serverId?;
    private intervalId?;
    constructor();
    /**
     * Start the agent
     */
    start(): Promise<void>;
    /**
     * Stop the agent
     */
    stop(): void;
    /**
     * Register this server with the main application
     */
    private registerServer;
    /**
     * Send heartbeat and metrics to main server
     */
    private sendHeartbeatAndMetrics;
    /**
     * Get server hardware information
     */
    private getServerInfo;
    /**
     * Load server configuration from file
     */
    private loadServerConfig;
    /**
     * Save server configuration to file
     */
    private saveServerConfig;
}
//# sourceMappingURL=index.d.ts.map