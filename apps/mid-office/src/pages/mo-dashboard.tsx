/**
 * Mid-Office Dashboard
 *
 * Summary view for the dealing desk showing key operational metrics.
 * Static placeholder cards for Phase 2A scaffolding.
 */

import {
  CheckSquare,
  Landmark,
  AlertTriangle,
  Calculator,
} from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  accent: string;
}

function SummaryCard({ title, value, icon: Icon, accent }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function MODashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Mid-Office Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dealing desk operations overview
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Unconfirmed Trades"
          value="12"
          icon={CheckSquare}
          accent="bg-indigo-600"
        />
        <SummaryCard
          title="Pending Settlements"
          value="8"
          icon={Landmark}
          accent="bg-violet-600"
        />
        <SummaryCard
          title="Mandate Breaches"
          value="3"
          icon={AlertTriangle}
          accent="bg-amber-600"
        />
        <SummaryCard
          title="NAV Pending"
          value="5"
          icon={Calculator}
          accent="bg-purple-600"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Detailed dashboard widgets will be implemented in a future phase.
        </p>
      </div>
    </div>
  );
}
