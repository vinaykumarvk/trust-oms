/**
 * Placeholder Page
 *
 * Generic placeholder for sections that are not yet implemented.
 * Used for operations, compliance, analytics, and tools routes.
 */

import { useLocation } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Construction } from "lucide-react";

/** Convert a path segment like "/operations/eod" to "EOD Processing" style */
function formatPathTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  return segments
    .map((s) =>
      s
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" / ");
}

export default function PlaceholderPage() {
  const location = useLocation();
  const title = formatPathTitle(location.pathname);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          This section is under development.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Construction className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm text-muted-foreground">
              This feature is planned for a future phase. Check the navigation
              sidebar for available sections.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Path: <code className="rounded bg-muted px-1.5 py-0.5">{location.pathname}</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
