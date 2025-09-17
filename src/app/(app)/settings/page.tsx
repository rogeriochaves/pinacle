import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <Card className="max-w-2xl border-border/70">
      <CardHeader>
        <CardTitle className="text-2xl">Account & billing settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Settings will soon include billing portals, API tokens, environment variables, and SSH key
          management. Until then, reach out to the Pinacle team and we will configure everything for
          you manually.
        </p>
        <p>
          Email <a href="mailto:hello@pinacle.dev" className="text-primary underline-offset-4 hover:underline">hello@pinacle.dev</a> with any adjustments you need.
        </p>
      </CardContent>
    </Card>
  );
}
