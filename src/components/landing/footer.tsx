"use client";

import { Twitter } from "lucide-react";
import Link from "next/link";
import { DockerIcon } from "../icons/docker";

const navigation = {
  main: [
    { name: "About", href: "/about" },
    { name: "Blog", href: "/blog" },
    { name: "Jobs", href: "/jobs" },
    { name: "Press", href: "/press" },
    { name: "Accessibility", href: "/accessibility" },
    { name: "Partners", href: "/partners" },
  ],
  support: [
    { name: "Pricing", href: "/pricing" },
    { name: "Documentation", href: "/docs" },
    { name: "Guides", href: "/guides" },
    { name: "API Status", href: "/status" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Blog", href: "/blog" },
    { name: "Jobs", href: "/jobs" },
    { name: "Press", href: "/press" },
  ],
  legal: [
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
  ],
  social: [
    {
      name: "Docker Hub",
      href: "https://hub.docker.com/u/pinacledev",
      icon: DockerIcon,
    },
    {
      name: "Twitter",
      href: "#",
      icon: Twitter,
    },
  ],
};

export const Footer = () => {
  return (
    <footer className="bg-gray-900" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-8 lg:px-8">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">
                  Support
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.support.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold leading-6 text-white">
                  Company
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.company.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-white">
                  Legal
                </h3>
                <ul role="list" className="mt-6 space-y-4">
                  {navigation.legal.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <p className="text-sm leading-6 text-gray-300">
              Secure, scalable AI development environments. You can just do things.
            </p>
            <p className="text-sm leading-6 text-gray-300">
              hello@pinacle.dev
            </p>
            <div className="flex space-x-6">
              {navigation.social.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className="text-gray-400 hover:text-gray-300"
                  >
                    <span className="sr-only">{item.name}</span>
                    <Icon className="h-6 w-6" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-24" style={{ containerType: "inline-size" }}>
          <pre className="text-[3.1cqw] leading-[1.25] text-gray-200 leading-[1em]">
            {`██████╗ ██╗███╗   ██╗ █████╗  ██████╗██╗     ███████╗
██╔══██╗██║████╗  ██║██╔══██╗██╔════╝██║     ██╔════╝
██████╔╝██║██╔██╗ ██║███████║██║     ██║     █████╗
██╔═══╝ ██║██║╚██╗██║██╔══██║██║     ██║     ██╔══╝
██║     ██║██║ ╚████║██║  ██║╚██████╗███████╗███████╗
╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚══════╝`}
          </pre>
        </div>
        <div className="mt-6 border-t border-gray-700 pt-6">
          <p className="text-xs leading-5 text-gray-400">
            &copy; {new Date().getFullYear()} Pinacle, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
