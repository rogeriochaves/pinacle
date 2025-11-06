"use client";

import { Code, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Button } from "../ui/button";

const navigation = [
  { name: "Features", href: "#features" },
  { name: "Pricing", href: "/pricing" },
  { name: "Docs", href: "/docs" },
  { name: "Blog", href: "/blog" },
];

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();

  return (
    <header>
      <nav className="flex items-center justify-between">
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5 flex items-center space-x-2">
            <Image
              src="/logo.png"
              alt="Pinacle Logo"
              className="h-10 w-10"
              width={40}
              height={40}
            />
            <span className="font-bold font-mono text-xl">pinacle</span>
          </Link>
        </div>

        <div className="flex lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4">
          {navigation.map((item) => (
            <Button variant="ghost" asChild key={item.name}>
              <Link href={item.href}>{item.name}</Link>
            </Button>
          ))}
          {session ? (
            <Button variant="accent" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/signin">Sign in</Link>
              </Button>
              <Button variant="accent" asChild>
                <Link href="/auth/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div className="fixed inset-0 z-50" />
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-background border-l-2 border-border-contrast px-6 py-6 sm:max-w-sm">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="-m-1.5 p-1.5 flex items-center space-x-2"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-orange-200 border-2 border-border-contrast">
                  <Code className="h-4 w-4 text-orange-900" />
                </div>
                <span className="font-bold font-mono text-xl text-foreground">
                  PINACLE
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y-2 divide-border-contrast">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="-mx-3 block rounded-sm border-2 border-transparent px-3 py-2 text-base font-bold font-mono leading-7 text-foreground hover:border-border-contrast hover:bg-slate-100"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name.toUpperCase()}
                    </Link>
                  ))}
                </div>
                <div className="py-6 space-y-2">
                  {session ? (
                    <Button variant="accent" asChild className="w-full">
                      <Link href="/dashboard">DASHBOARD</Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="ghost" asChild className="w-full">
                        <Link href="/auth/signin">SIGN IN</Link>
                      </Button>
                      <Button variant="accent" asChild className="w-full">
                        <Link href="/auth/signup">GET STARTED</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
