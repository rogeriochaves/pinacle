import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function NewPodPage() {
  return (
    <Card className="border-dashed border-border/70 bg-background">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">Coming soon</Badge>
        <CardTitle className="text-2xl">Provision a new pod</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-muted-foreground">
        <p>
          We are wiring up the provisioning workflow that talks directly to the gVisor control plane.
          Soon you will be able to pick a template, assign a machine spec, and let Pinacle spin up the
          environment without leaving this page.
        </p>
        <p>
          In the meantime, reach out to <a href="mailto:hello@pinacle.dev" className="text-primary underline-offset-4 hover:underline">hello@pinacle.dev</a> to have a custom pod created for your team.
        </p>
      </CardContent>
    </Card>
  );
}
