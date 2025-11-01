"use client";

import { Loader2, Plus, Terminal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { podRecordToPinacleConfig } from "../../lib/pod-orchestration/pinacle-config";
import { api } from "../../lib/trpc/client";

type TerminalSession = {
  id: string;
  name: string;
  tmuxSession?: string; // Optional tmux session for process logs
};

type TerminalTabsProps = {
  pod: {
    id: string;
    name: string;
    config: string;
    uiState?: string | null;
  };
  terminalTabId: string; // The actual hash-based ID of the terminal tab
  getTabUrl: (tabId: string, terminalSession?: string) => string;
  focusTrigger?: number; // Timestamp that changes when parent wants to focus this terminal
};

export const TerminalTabs = ({
  pod,
  terminalTabId,
  getTabUrl,
  focusTrigger,
}: TerminalTabsProps) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [sessionCounter, setSessionCounter] = useState(1);
  const [activeTerminalSession, setActiveTerminalSession] =
    useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );

  const updateUiStateMutation = api.pods.updateUiState.useMutation();
  const killTerminalSessionMutation =
    api.pods.killTerminalSession.useMutation();

  // Initialize sessions on mount
  useEffect(() => {
    if (isInitialized) return;

    const initSessions: TerminalSession[] = [];

    // Parse processes from config
    try {
      const config = podRecordToPinacleConfig({
        config: pod.config,
        name: pod.name,
      });

      // Add process sessions
      for (const process of config.processes || []) {
        initSessions.push({
          id: `process-${pod.id}-${process.name}`,
          name: process.name,
          tmuxSession: `process-${pod.id}-${process.name}`,
        });
      }
    } catch (error) {
      console.error("Failed to parse config:", error);
    }

    // Load saved custom terminal sessions from database (from uiState)
    if (pod.uiState) {
      try {
        const uiState = JSON.parse(pod.uiState) as {
          terminalSessions?: Array<{ id: string; name: string }>;
        };

        if (uiState.terminalSessions) {
          initSessions.push(...uiState.terminalSessions.map((s) => ({ ...s })));

          // Update counter to be higher than any existing terminal number
          const terminalNumbers = uiState.terminalSessions
            .map((s) => {
              const match = s.name.match(/Terminal (\d+)/);
              return match ? parseInt(match[1], 10) : 0;
            })
            .filter((n) => n > 0);

          if (terminalNumbers.length > 0) {
            setSessionCounter(Math.max(...terminalNumbers) + 1);
          }
        }
      } catch (error) {
        console.error("Failed to parse UI state:", error);
      }
    }

    // If no sessions at all, create Terminal 1
    if (initSessions.length === 0) {
      initSessions.push({
        id: "terminal-1",
        name: "Terminal 1",
      });
      setSessionCounter(2);
    }

    setSessions(initSessions);
    setActiveTerminalSession(initSessions[0].id);
    setIsInitialized(true);
  }, [pod, isInitialized]);

  // Persist custom terminal sessions whenever they change
  useEffect(() => {
    if (!isInitialized) return;

    const customSessions = sessions.filter((s) => !s.tmuxSession);

    updateUiStateMutation.mutate({
      podId: pod.id,
      uiState: {
        terminalSessions: customSessions.map(({ id, name }) => ({ id, name })),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, pod.id, isInitialized, updateUiStateMutation.mutate]);

  // Focus the active terminal session iframe
  const focusActiveTerminal = useCallback(() => {
    if (!activeTerminalSession) return;

    const iframe = document.getElementById(
      `terminal-${activeTerminalSession}`,
    ) as HTMLIFrameElement;

    console.log(
      "[TerminalTabs] Attempting to focus terminal iframe:",
      `terminal-${activeTerminalSession}`,
      iframe,
    );

    if (iframe?.contentWindow) {
      // Send focus message to injected script
      iframe.contentWindow.postMessage({ type: "pinacle-focus" }, "*");
      // Also try to focus the iframe element itself
      iframe.focus();
      console.log("[TerminalTabs] Sent focus message to terminal");
    } else {
      console.warn(
        "[TerminalTabs] Terminal iframe not found or contentWindow not available",
      );
    }
  }, [activeTerminalSession]);

  // Focus when parent requests it (e.g., when switching to terminal tab)
  useEffect(() => {
    if (focusTrigger) {
      focusActiveTerminal();
    }
  }, [focusTrigger, focusActiveTerminal]);

  // Focus when switching between terminal sessions
  useEffect(() => {
    if (activeTerminalSession) {
      focusActiveTerminal();
    }
  }, [activeTerminalSession, focusActiveTerminal]);

  // Create a new terminal session
  const createNewSession = () => {
    // Find the next available terminal number
    const customSessions = sessions.filter((s) => !s.tmuxSession);
    const usedNumbers = customSessions
      .map((s) => {
        const match = s.name.match(/Terminal (\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    // Find the smallest unused number starting from 1
    let nextNumber = 1;
    while (usedNumbers.includes(nextNumber)) {
      nextNumber++;
    }

    const newSession: TerminalSession = {
      id: `terminal-${nextNumber}`,
      name: `Terminal ${nextNumber}`,
    };
    setSessions([...sessions, newSession]);
    setSessionCounter(Math.max(sessionCounter, nextNumber + 1));
    setActiveTerminalSession(newSession.id);
  };

  // Delete a terminal session (can't delete the last one, can't delete process sessions)
  const deleteSession = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);

    // Can't delete process sessions
    if (session?.tmuxSession) {
      return;
    }

    // Don't allow deleting the last custom terminal
    const customSessions = sessions.filter((s) => !s.tmuxSession);
    if (customSessions.length <= 1) {
      return;
    }

    // Set loading state
    setDeletingSessionId(sessionId);

    // Kill the tmux session in the container first
    try {
      await killTerminalSessionMutation.mutateAsync({
        podId: pod.id,
        sessionId: sessionId,
      });
    } catch (error) {
      console.error("Failed to kill tmux session:", error);
      // Continue anyway - UI cleanup is still valuable
    }

    const newSessions = sessions.filter((s) => s.id !== sessionId);
    setSessions(newSessions);

    // If we're deleting the active session, switch to the first remaining one
    if (activeTerminalSession === sessionId) {
      setActiveTerminalSession(newSessions[0].id);
    }

    // Clear loading state
    setDeletingSessionId(null);
  };

  return (
    <div className="flex flex-row-reverse w-full h-full">
      {/* VSCode-style vertical sidebar */}
      <div className="w-72 bg-neutral-800 border-l border-neutral-700 flex flex-col">
        <div className="p-2 text-xs font-mono text-neutral-400 uppercase tracking-wider border-b border-neutral-700 flex items-center justify-between">
          <span>Sessions</span>
          <button
            type="button"
            onClick={createNewSession}
            className="p-1 hover:bg-neutral-700 rounded transition-colors"
            title="New Terminal"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* All terminal sessions (both custom and process logs) */}
          {sessions.map((session) => {
            const customSessions = sessions.filter((s) => !s.tmuxSession);
            const canDelete = !session.tmuxSession && customSessions.length > 1;

            return (
              <div
                key={session.id}
                className={`group flex items-center justify-between px-3 py-2 text-sm font-mono transition-colors ${
                  activeTerminalSession === session.id
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTerminalSession(session.id)}
                  className="flex-1 text-left"
                >
                  <Terminal className="w-4 h-4 inline mr-2" />
                  {session.name}
                </button>
                {!session.tmuxSession && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSession(session.id);
                    }}
                    className={`p-1 hover:bg-neutral-700 rounded transition-opacity ${
                      !canDelete
                        ? "opacity-0 cursor-not-allowed"
                        : deletingSessionId === session.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                    }`}
                    title={
                      !canDelete
                        ? "Can't delete last terminal"
                        : deletingSessionId === session.id
                          ? "Closing..."
                          : "Close Terminal"
                    }
                    disabled={!canDelete || deletingSessionId === session.id}
                  >
                    {deletingSessionId === session.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal iframes - render all, show only active */}
      <div className="flex-1 relative">
        {sessions.map((session) => (
          <iframe
            key={`terminal-${session.id}`}
            id={`terminal-${session.id}`}
            src={getTabUrl(terminalTabId, session.tmuxSession || session.id)}
            className="absolute inset-0 w-full h-full border-0"
            title={`Terminal - ${session.name}`}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation allow-orientation-lock"
            style={{
              visibility:
                activeTerminalSession === session.id ? "visible" : "hidden",
              zIndex: activeTerminalSession === session.id ? 1 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};
