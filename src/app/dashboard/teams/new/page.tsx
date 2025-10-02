"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { api } from "../../../../lib/trpc/client";

const createTeamSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
});

type CreateTeamForm = z.infer<typeof createTeamSchema>;

export default function NewTeamPage() {
  const router = useRouter();
  const createTeamMutation = api.teams.create.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateTeamForm>({
    resolver: zodResolver(createTeamSchema),
  });

  const onSubmit = async (data: CreateTeamForm) => {
    try {
      await createTeamMutation.mutateAsync(data);
      router.push(`/dashboard/teams`);
    } catch (error) {
      console.error("Failed to create team:", error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" asChild>
          <Link href="/dashboard/teams">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Teams
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Create New Team
          </h1>
          <p className="mt-2 text-gray-600">
            Set up a team to collaborate with others
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Information</CardTitle>
          <CardDescription>
            Provide basic information about your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Team Name</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="My Awesome Team"
              />
              {errors.name && (
                <p className="text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                {...register("description")}
                placeholder="Brief description of your team's purpose"
              />
            </div>

            <div className="flex items-center justify-end space-x-4">
              <Button variant="outline" asChild>
                <Link href="/dashboard/teams">Cancel</Link>
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={createTeamMutation.isPending}
              >
                {createTeamMutation.isPending ? "Creating..." : "Create Team"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
