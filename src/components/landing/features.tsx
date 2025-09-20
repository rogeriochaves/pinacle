"use client";

import {
  Code2,
  Kanban,
  Terminal,
  Smartphone,
  Clock,
  Shield,
  Zap,
  Users
} from "lucide-react";

const features = [
  {
    name: "Claude Code Integration",
    description: "AI-powered coding assistant built right into your development environment. Get intelligent code suggestions, debugging help, and automated refactoring.",
    icon: Code2,
  },
  {
    name: "Vibe Kanban Board",
    description: "Visual project management with drag-and-drop task organization. Track your AI agent's progress and manage your development workflow.",
    icon: Kanban,
  },
  {
    name: "VS Code in Browser",
    description: "Full-featured VS Code experience accessible from any browser. No installation required, works on any device.",
    icon: Terminal,
  },
  {
    name: "Mobile Access",
    description: "Check on your AI agents from your phone. Monitor progress, view logs, and control your development environment on the go.",
    icon: Smartphone,
  },
  {
    name: "24/7 Uptime",
    description: "Your AI agents never sleep. Keep your development environment running continuously while you're away from your computer.",
    icon: Clock,
  },
  {
    name: "Secure Sandboxing",
    description: "gVisor isolation ensures your code and data are secure. Each VM is completely isolated from others for maximum security.",
    icon: Shield,
  },
  {
    name: "Instant Deployment",
    description: "Spin up new development environments in seconds. Pre-configured templates get you started immediately.",
    icon: Zap,
  },
  {
    name: "Team Collaboration",
    description: "Invite team members to collaborate on projects. Share access to development environments and work together seamlessly.",
    icon: Users,
  },
];

export const Features = () => {
  return (
    <section className="bg-gray-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Everything you need for AI development
          </h2>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Our platform combines the best development tools with AI assistants
            in secure, scalable virtual machines.
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <Icon className="h-5 w-5 flex-none text-blue-600" />
                    {feature.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
};

