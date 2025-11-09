"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

type TourStep = {
  id: number;
  name: string;
  image: string;
  label: string; // Description of current step
  hotspot?: {
    x: number; // percentage from left
    y: number; // percentage from top
  };
};

const tourSteps: TourStep[] = [
  {
    id: 1,
    name: "Your App",
    image: "/sneak-peak/tab-1-app.png",
    label: "Preview your app and any local ports",
    hotspot: { x: 25, y: 10 },
  },
  {
    id: 2,
    name: "Claude Code",
    image: "/sneak-peak/tab-2-claude-code.png",
    label: "Build with any coding assistant (Claude Code, Cursor CLI, etc.)",
    hotspot: { x: 36, y: 10 },
  },
  {
    id: 3,
    name: "VS Code",
    image: "/sneak-peak/tab-3-vs-code.png",
    label: "Navigate the code with VS Code",
    hotspot: { x: 47, y: 10 },
  },
  {
    id: 4,
    name: "Terminal",
    image: "/sneak-peak/tab-4-terminal.png",
    label: "Run commands and install what you need",
    hotspot: { x: 58, y: 10 },
  },
  {
    id: 5,
    name: "Vibe Kanban",
    image: "/sneak-peak/tab-5-vibe-kanban.png",
    label: "Build in parallel with Vibe Kanban",
    hotspot: { x: 70, y: 10 },
  },
  {
    id: 6,
    name: "Commit Changes",
    image: "/sneak-peak/tab-6-commit.png",
    label: "Commit your changes",
    hotspot: { x: 92, y: 8 },
  },
];

export const SneakPeek = () => {
  const [activeStep, setActiveStep] = useState(0);
  const currentStep = tourSteps[activeStep];

  const goToNextStep = () => {
    setActiveStep((prev) => (prev + 1) % tourSteps.length);
  };

  return (
    <section className="bg-gradient-to-b from-white to-gray-50 py-16 sm:py-24 border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 text-center">
          <h2 className="text-xl font-bold font-mono tracking-tight text-foreground sm:text-2xl">
            This is how it looks like
          </h2>
          <p className="mt-4 text-md leading-8 text-muted-foreground font-mono">
            Everything you need to build, code, and ship — right in your browser
          </p>
        </div>

        {/* Mac-style Browser Window */}
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl shadow-2xl overflow-hidden border border-gray-300 bg-white">
            {/* Browser Chrome */}
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-3">
              <div className="flex items-center gap-2">
                {/* Traffic Lights */}
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>

                {/* URL Bar */}
                <div className="flex-1 ml-4">
                  <div className="bg-white rounded px-3 py-1 text-xs text-gray-600 font-mono">
                    pinacle.dev/{currentStep.name.toLowerCase().replace(/\s+/g, "-")}
                  </div>
                </div>
              </div>
            </div>

            {/* Browser Content */}
            <div className="relative bg-white aspect-[16/10] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative w-full h-full"
                >
                  {/* Clickable image overlay */}
                  <button
                    type="button"
                    onClick={goToNextStep}
                    className="absolute inset-0 w-full h-full cursor-pointer z-10"
                    aria-label="Continue tour"
                  />

                  <Image
                    src={currentStep.image}
                    alt={`${currentStep.name} screenshot`}
                    fill
                    className="object-cover object-top"
                    priority={activeStep === 0}
                  />

                  {/* Interactive Navigation Hotspot */}
                  {currentStep.hotspot && (
                    <div
                      className="absolute pointer-events-none z-20"
                      style={{
                        left: `${currentStep.hotspot.x}%`,
                        top: `${currentStep.hotspot.y}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {/* Pulsing Dot */}
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="relative"
                      >
                        <motion.div
                          animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.7, 0.3, 0.7],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "easeInOut",
                          }}
                          className="absolute inset-0 w-8 h-8 rounded-full bg-orange-500"
                        />
                        <div className="relative w-8 h-8 rounded-full bg-orange-500 border-2 border-white shadow-lg" />
                      </motion.div>

                      {/* Tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-10">
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.7 }}
                          className="flex flex-col items-center gap-2"
                        >
                          <div className="bg-orange-500 text-white text-sm font-mono font-bold px-4 py-2 rounded-lg shadow-xl whitespace-nowrap">
                            {currentStep.label}
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-orange-500 rotate-45" />
                          </div>
                          <div className="text-xs font-mono text-gray-600 bg-white px-2 py-1 rounded">
                            Click to continue →
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Navigation Dots */}
          <div className="flex justify-center gap-2 mt-8">
            {tourSteps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  activeStep === index
                    ? "bg-orange-500 w-8"
                    : "bg-gray-300 hover:bg-gray-400"
                }`}
                aria-label={`View ${step.name}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
