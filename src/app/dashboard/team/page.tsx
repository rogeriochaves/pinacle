"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { api } from "../../../lib/trpc/client";

export default function TeamPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const { data: teams } = api.teams.getUserTeams.useQuery();
  const inviteMutation = api.teams.inviteMember.useMutation();

  // Get the first team (for now, we'll assume single team per user)
  const team = teams?.[0];

  const { data: members, refetch: refetchMembers } = api.teams.getMembers.useQuery(
    { teamId: team?.id || "" },
    { enabled: !!team }
  );

  const handleInvite = async () => {
    if (!team || !inviteEmail) return;

    setIsInviting(true);
    try {
      await inviteMutation.mutateAsync({
        teamId: team.id,
        email: inviteEmail,
        role: "member",
      });
      setInviteEmail("");
      refetchMembers();
    } catch (error) {
      console.error("Failed to invite:", error);
      alert("Failed to send invitation. Please try again.");
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Button variant="ghost" asChild className="-ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-mono text-sm">Back to Workbench</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-mono font-bold text-slate-900 mb-2">
            Team
          </h1>
          <p className="text-slate-600 font-mono text-sm">
            Collaborate with your team members
          </p>
        </div>

        {!team ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-600 font-mono mb-4">No team found</p>
            <p className="text-sm text-slate-500 font-mono">
              Teams are automatically created when you sign up
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Team Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-mono font-bold text-xl text-slate-900 mb-1">
                {team.name}
              </h2>
              {team.description && (
                <p className="text-slate-600 text-sm">{team.description}</p>
              )}
            </div>

            {/* Invite Section */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                Invite Team Members
              </h2>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInvite();
                    }}
                    className="font-mono"
                  />
                </div>
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail || isInviting}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-mono font-bold"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {isInviting ? "Inviting..." : "Send Invite"}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                They'll receive an email invitation to join your team
              </p>
            </div>

            {/* Team Members */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                Team Members ({members?.length || 0})
              </h2>

              <div className="space-y-3">
                {members?.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center shrink-0">
                        <span className="text-slate-700 font-mono font-bold text-sm">
                          {member.user?.name?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>

                      {/* Info */}
                      <div>
                        <p className="font-mono font-bold text-slate-900">
                          {member.user?.name || "Unknown"}
                        </p>
                        <p className="text-sm text-slate-600 font-mono">
                          {member.user?.email || member.user?.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        className={
                          member.role === "owner"
                            ? "bg-orange-100 text-orange-800 border-orange-200 font-mono"
                            : "bg-slate-100 text-slate-800 border-slate-200 font-mono"
                        }
                      >
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                ))}

                {(!members || members.length === 0) && (
                  <div className="text-center py-8 text-slate-500 font-mono text-sm">
                    No team members yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}