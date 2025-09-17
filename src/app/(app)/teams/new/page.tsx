import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function NewTeamPage() {
  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-3">
        <Badge variant="secondary" className="w-fit text-xs uppercase tracking-wide">
          Upcoming
        </Badge>
        <CardTitle className="text-2xl">Team setup wizard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-muted-foreground">
        <p>
          We are polishing the guided onboarding flow where you will be able to name your workspace,
          pick a billing tier, and attach secrets before provisioning pods. For now, every new
          account gets a starter team automatically.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <a href="mailto:hello@pinacle.dev">Request manual team setup</a>
        </Button>
      </CardContent>
    </Card>
  );
}
