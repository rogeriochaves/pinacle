import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function InvitePage() {
  return (
    <Card className="max-w-lg border-border/70">
      <CardHeader>
        <CardTitle className="text-2xl">Invite a teammate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Team invitations are almost ready. Share an email below so we can notify you the moment
          invites go live, or get in touch and we will add collaborators manually for now.
        </p>
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="teammate@company.com" disabled />
          </div>
          <Button type="button" disabled className="w-full">
            Invitations coming soon
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
