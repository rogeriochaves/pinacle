import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { env } from "@/env";
import { authOptions } from "@/lib/auth";

const isAdmin = (userEmail: string): boolean => {
  if (!env.ADMIN_EMAILS) {
    return false;
  }

  const adminEmails = env.ADMIN_EMAILS.split(",").map((email) =>
    email.trim().toLowerCase(),
  );
  return adminEmails.includes(userEmail.toLowerCase());
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email || !isAdmin(session.user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <Link href="/admin" className="text-xl font-bold text-gray-900">
                  Admin Panel
                </Link>
              </div>
              <div className="ml-6 flex space-x-8">
                <Link
                  href="/admin"
                  className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                >
                  Servers
                </Link>
                <Link
                  href="/admin/users"
                  className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                >
                  Users
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-500">
                {session.user.email}
              </span>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
