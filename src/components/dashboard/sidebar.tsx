"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Code,
  Home,
  Server,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Pods", href: "/dashboard/pods", icon: Server },
  { name: "Teams", href: "/dashboard/teams", icon: Users },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export const Sidebar = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-background border-b-2 border-border-contrast px-4 py-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-sm font-bold font-mono leading-6 text-foreground">
          DASHBOARD
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={session?.user?.image || ""}
                  alt={session?.user?.name || ""}
                />
                <AvatarFallback>
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="relative z-50 lg:hidden">
          <div className="fixed inset-0 bg-gray-900/80" />
          <div className="fixed inset-0 flex">
            <div className="relative mr-16 flex w-full max-w-xs flex-1">
              <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                <button
                  type="button"
                  className="-m-2.5 p-2.5"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2">
                <div className="flex h-16 shrink-0 items-center">
                  <Code className="h-8 w-8 text-blue-600" />
                  <span className="ml-2 font-bold text-xl text-gray-900">
                    Pinacle
                  </span>
                </div>
                <nav className="flex flex-1 flex-col">
                  <ul role="list" className="flex flex-1 flex-col gap-y-7">
                    <li>
                      <ul role="list" className="-mx-2 space-y-1">
                        {navigation.map((item) => {
                          const Icon = item.icon;
                          const isActive = pathname === item.href;
                          return (
                            <li key={item.name}>
                              <Link
                                href={item.href}
                                className={`group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold ${
                                  isActive
                                    ? "bg-gray-50 text-blue-600"
                                    : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                                }`}
                                onClick={() => setSidebarOpen(false)}
                              >
                                <Icon className="h-6 w-6 shrink-0" />
                                {item.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r-2 border-border-contrast bg-background px-6">
          <div className="flex h-16 shrink-0 items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-orange-200 border-2 border-border-contrast">
              <Code className="h-4 w-4 text-orange-900" />
            </div>
            <span className="ml-2 font-bold font-mono text-xl text-foreground">
              PINACLE
            </span>
          </div>

          {/* Create Pod Button */}
          <div className="flex">
            <Button asChild variant="accent" className="w-full">
              <Link href="/dashboard/pods/new">
                <Plus className="mr-2 h-4 w-4" />
                CREATE POD
              </Link>
            </Button>
          </div>

          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={`group flex gap-x-3 rounded-sm p-3 text-sm leading-6 font-bold font-mono border-2 transition-all ${
                            isActive
                              ? "bg-orange-200 text-orange-950 border-border-contrast shadow-btn"
                              : "text-foreground border-transparent hover:border-border-contrast hover:bg-slate-100"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.name.toUpperCase()}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
              <li className="-mx-6 mt-auto">
                <div className="flex items-center gap-x-4 px-6 py-3 text-sm font-bold font-mono leading-6 text-foreground border-t-2 border-border-contrast">
                  <div className="h-8 w-8 rounded-sm bg-slate-200 border-2 border-border-contrast flex items-center justify-center">
                    <span className="text-slate-900 font-bold text-xs">
                      {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                    </span>
                  </div>
                  <span className="sr-only">Your profile</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold">
                      {session?.user?.name?.toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {session?.user?.email}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/settings">
                          <Settings className="mr-2 h-4 w-4" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
};
