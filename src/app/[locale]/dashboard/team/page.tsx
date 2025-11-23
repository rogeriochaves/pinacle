"use client";

import { ArrowLeft, Mail, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/trpc/client";

export default function TeamPage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const t = useTranslations("team");

  const { data: teams } = api.teams.getUserTeams.useQuery();
  const inviteMutation = api.teams.inviteMember.useMutation();
  const removeMemberMutation = api.teams.removeMember.useMutation();

  // Set default selected team to first team when teams load
  useEffect(() => {
    if (teams && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  const selectedTeam = teams?.find(team => team.id === selectedTeamId) || teams?.[0];

  const { data: members, refetch: refetchMembers } = api.teams.getMembers.useQuery(
    { teamId: selectedTeam?.id || "" },
    { enabled: !!selectedTeam }
  );

  const handleInvite = async () => {
    if (!selectedTeam || !inviteEmail) return;

    setIsInviting(true);
    try {
      await inviteMutation.mutateAsync({
        teamId: selectedTeam.id,
        email: inviteEmail,
        role: "member",
      });
      setInviteEmail("");
      refetchMembers();
    } catch (error) {
      console.error("Failed to invite:", error);
      alert(t("failedToInvite"));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedTeam) return;

    if (!confirm(t("confirmRemove"))) {
      return;
    }

    try {
      await removeMemberMutation.mutateAsync({
        teamId: selectedTeam.id,
        memberId,
      });
      refetchMembers();
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert(t("failedToRemove"));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" asChild className="-ml-2">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="font-mono text-sm">{t("backToWorkbench")}</span>
              </Link>
            </Button>

            {/* Team Selector - Top Right */}
            {teams && teams.length > 1 && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-slate-600">{t("teamSelector")}</span>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="w-48 font-mono border-slate-300">
                    <SelectValue placeholder={t("chooseTeam")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-mono font-bold text-slate-900 mb-2">
            {selectedTeam ? selectedTeam.name : t("title")}
          </h1>
          <p className="text-slate-600 font-mono text-sm">
            {selectedTeam?.description || t("defaultDescription")}
          </p>
        </div>

        {!selectedTeam ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-600 font-mono mb-4">{t("noTeamFound")}</p>
            <p className="text-sm text-slate-500 font-mono">
              {t("noTeamDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Invite Section - Only show for owners/admins */}
            {(selectedTeam.role === "owner" || selectedTeam.role === "admin") && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                  {t("inviteTeamMembers")}
                </h2>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder={t("emailPlaceholder")}
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
                  {isInviting ? t("inviting") : t("sendInvite")}
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                {t("inviteDescription")}
              </p>
            </div>
            )}

            {/* Team Members */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                {t("teamMembersCount", { count: members?.length || 0 })}
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
                          {member.user?.name || t("unknown")}
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
                        {t(member.role as "owner" | "admin" | "member")}
                      </Badge>

                      {/* Remove button - only show for owners/admins, not for owner role, not for self */}
                      {(selectedTeam.role === "owner" || selectedTeam.role === "admin") &&
                       member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removeMemberMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2"
                          title={t("removeMember")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {(!members || members.length === 0) && (
                  <div className="text-center py-8 text-slate-500 font-mono text-sm">
                    {t("noMembers")}
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