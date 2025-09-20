"use client";

import { GithubIcon, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Header } from "./header";

const renderTerminalScreen = (
  terminalString: string,
  currentTab: "claude" | "vibe" | "vs-code" | "browser",
  setCurrentTab: (tab: "claude" | "vibe" | "vs-code" | "browser") => void,
) => {
  const lines = terminalString.split("\n");

  return (
    <pre className="text-xs pr-10 leading-[1.25]">
      {lines.map((line, index) => {
        const lineKey = `terminal-line-${index}-${line.slice(0, 10)}`;

        // Check if this is the header line with tabs
        if (line.includes("╔══") && line.includes("Claude Code")) {
          return (
            <div key={lineKey} className="text-white">
              <span>╔══ </span>
              <button
                type="button"
                onClick={() => setCurrentTab("claude")}
                className={`cursor-pointer hover:text-orange-300 transition-colors ${
                  currentTab === "claude" ? "text-orange-200" : ""
                }`}
              >
                Claude Code
              </button>
              <span> | </span>
              <button
                type="button"
                onClick={() => setCurrentTab("vibe")}
                className={`cursor-pointer hover:text-orange-300 transition-colors ${
                  currentTab === "vibe" ? "text-orange-200" : ""
                }`}
              >
                Vibe Kanban
              </button>
              <span> | </span>
              <button
                type="button"
                onClick={() => setCurrentTab("vs-code")}
                className={`cursor-pointer hover:text-orange-300 transition-colors ${
                  currentTab === "vs-code" ? "text-orange-200" : ""
                }`}
              >
                VS Code
              </button>
              <span> | </span>
              <button
                type="button"
                onClick={() => setCurrentTab("browser")}
                className={`cursor-pointer hover:text-orange-300 transition-colors ${
                  currentTab === "browser" ? "text-orange-200" : ""
                }`}
              >
                Browser
              </button>
              <span> ═══╗</span>
            </div>
          );
        }

        // Check if this is a border line (top, bottom, or shadow)
        if (
          line.includes("╚") ||
          line.startsWith("|") ||
          line.startsWith(" ░")
        ) {
          return (
            <div key={lineKey} className="text-white">
              {line}
            </div>
          );
        }

        // For content lines with ║ borders
        if (line.includes("║")) {
          const parts = line.split("║");
          return (
            <div key={lineKey}>
              <span className="text-white">║</span>
              <span className="text-gray-400">{parts[1]}</span>
              <span className="text-white">║</span>
              {parts[2] && <span className="text-white">{parts[2]}</span>}
            </div>
          );
        }

        // Fallback for any other lines
        return (
          <div key={lineKey} className="text-white">
            {line}
          </div>
        );
      })}
    </pre>
  );
};

export const Hero = () => {
  const [currentTab, setCurrentTab] = useState<
    "claude" | "vibe" | "vs-code" | "browser"
  >("claude");

  return (
    <section className="relative bg-gray-900 py-6 px-6 lg:px-8 text-background">
      <div className="mx-auto max-w-7xl flex flex-col gap-10">
        <Header />
        <div className="flex gap-10 align-start w-full justify-between">
          <div className="flex flex-col gap-4 pb-8 max-w-2xl">
            <h1 className="text-4xl font-bold font-mono tracking-tight">
              dev box for your coding agents to run 24/7
            </h1>
            <h2>
              Stop using AI just for vibe coding prototypes, start using it for
              real software development
            </h2>
            <div className="flex gap-4 pt-4">
              <Button>
                {/* <Folder size={16} /> */}
                <GithubIcon size={16} />
                Open Repository
              </Button>
              <Button variant="accent">
                <Plus size={16} />
                New Project
              </Button>
            </div>
          </div>
          {currentTab === "claude" &&
            renderTerminalScreen(
              `╔══ Claude Code | Vibe Kanban | VS Code | Browser ═══╗
║                     |                              ║░
║  Sure, I will help  | import React, { useState } f ║░
║  you create a new   |                              ║░
║  React dashboard    | export default function App( ║░
║  with charts        |   const [count, setCount] =  ║░
║                     |                              ║░
║  Let me build a     |   return (                   ║░
║  comprehensive      |     <main className="p-6 spa ║░
║  dashboard with:    |       <header className="fle ║░
║                     |         <h1>Pinacle.dev</h1> ║░
║  • Sidebar Navigati |         <button onClick={()  ║░
║---------------------|           setCount(c => c +  ║░
║ ❚                 ▷ |                              ║░
╚════════════════════════════════════════════════════╝░
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░`,
              currentTab,
              setCurrentTab,
            )}
          {currentTab === "vibe" &&
            renderTerminalScreen(
              `╔══ Claude Code | Vibe Kanban | VS Code | Browser ═══╗
║                                                    ║░
║ To Do          │ In Progress    │ In Review        ║░
║ ────────────────────────────────────────────────── ║░
║ ┌────────────┐ │ ┌────────────┐ │ ┌──────────────┐ ║░
║ │Setup auth  │ │ │Build dashbo│ │ │Project setup │ ║░
║ └────────────┘ │ └────────────┘ │ └──────────────┘ ║░
║ ┌────────────┐ │ ┌────────────┐ │ ┌──────────────┐ ║░
║ │Design UI   │ │ │Add charts  │ │ │Database migra│ ║░
║ └────────────┘ │ └────────────┘ │ └──────────────┘ ║░
║ ┌────────────┐ │                │                  ║░
║ │Write tests │ │                │                  ║░
║ └────────────┘ │                │                  ║░
║ ┌────────────┐ │                │                  ║░
╚════════════════════════════════════════════════════╝░
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░`,
              currentTab,
              setCurrentTab,
            )}
          {currentTab === "vs-code" &&
            renderTerminalScreen(
              `╔══ Claude Code | Vibe Kanban | VS Code | Browser ═══╗
║                     |                              ║░
║  src/               | import React, { useState } f ║░
║  ├─ components/     |                              ║░
║  │  ├─ Header.tsx   | export default function App( ║░
║  │  ├─ Sidebar.tsx  |   const [count, setCount] =  ║░
║  │  └─ Card.tsx     |                              ║░
║  ├─ hooks/          |   return (                   ║░
║  │  └─ useFetch.ts  |     <main className="p-6 spa ║░
║  ├─ pages/          |       <header className="fle ║░
║  │  ├─ Home.tsx     |         <h1>Pinacle.dev</h1> ║░
║  │  └─ About.tsx    |         <button onClick={()  ║░
║  ├─ App.tsx         |           setCount(c => c +  ║░
║                     |                              ║░
╚════════════════════════════════════════════════════╝░
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░`,
              currentTab,
              setCurrentTab,
            )}
          {currentTab === "browser" &&
            renderTerminalScreen(
              `╔══ Claude Code | Vibe Kanban | VS Code | Browser ═══╗
║ ┌────────────────────────────────────────────────┐ ║░
║ │ [P] Pinacle     Home  About  Pricing  Contact  │ ║░
║ └────────────────────────────────────────────────┘ ║░
║                                                    ║░
║           DEV BOX FOR YOUR CODING AGENTS           ║░
║                                                    ║░
║      stop using AI just for prototypes, start      ║░
║      using it for real software development        ║░
║                                                    ║░
║             [Get Started]  [View Demo]             ║░
║                                                    ║░
║ ────────────────────────────────────────────────── ║░
║  © 2025 Example Site                               ║░
╚════════════════════════════════════════════════════╝░
 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░`,
              currentTab,
              setCurrentTab,
            )}
        </div>
      </div>
    </section>
  );
};
