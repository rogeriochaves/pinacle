"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "../ui/button";

export const Header = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session } = useSession();
  const t = useTranslations("header");

  const navigation = [
    { name: t("features"), href: "/#features" },
    { name: t("pricing"), href: "/pricing" },
    { name: t("docs"), href: "/docs" },
    { name: t("blog"), href: "/blog" },
  ];

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

        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:gap-x-4 lg:items-center">
          {navigation.map((item) => (
            <Button variant="ghost" asChild key={item.name}>
              <Link
                href={item.href}
                target={item.href === "/docs" ? "_blank" : undefined}
              >
                {item.name}
              </Link>
            </Button>
          ))}
          {session ? (
            <Button variant="accent" asChild>
              <Link href="/dashboard">{t("dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/signin">{t("signIn")}</Link>
              </Button>
              <Button variant="accent" asChild>
                <Link href="/auth/signup">{t("getStarted")}</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMobileMenuOpen(false);
            }}
            role="button"
            tabIndex={0}
            aria-label="Close menu"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 border-l-2 border-gray-700 px-6 py-6 sm:max-w-sm">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="-m-1.5 p-1.5 flex items-center space-x-2"
              >
                <Image
                  src="/logo.png"
                  alt="Pinacle Logo"
                  className="h-8 w-8"
                  width={32}
                  height={32}
                />
                <span className="font-bold font-mono text-xl text-white">
                  pinacle
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-white hover:bg-gray-800"
                aria-label={t("closeMenu")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-gray-700">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      target={item.href === "/docs" ? "_blank" : undefined}
                      className="-mx-3 block rounded-sm border-2 border-transparent px-3 py-2 text-base font-bold font-mono leading-7 text-white hover:border-gray-600 hover:bg-gray-800"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>
                <div className="py-6 space-y-2">
                  {session ? (
                    <Button variant="accent" asChild className="w-full">
                      <Link href="/dashboard">{t("dashboard")}</Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" asChild className="w-full">
                        <Link href="/auth/signin">{t("signIn")}</Link>
                      </Button>
                      <Button variant="accent" asChild className="w-full">
                        <Link href="/auth/signup">{t("getStarted")}</Link>
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
