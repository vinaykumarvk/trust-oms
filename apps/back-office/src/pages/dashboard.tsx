/**
 * Dashboard Page
 *
 * Placeholder dashboard with welcome header and summary cards.
 */

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Briefcase, CheckCircle, ArrowLeftRight, TrendingUp } from "lucide-react";

const summaryCards = [
  {
    title: "Total Portfolios",
    value: "1,248",
    description: "Active trust portfolios",
    icon: Briefcase,
    color: "text-blue-600",
  },
  {
    title: "Pending Approvals",
    value: "23",
    description: "Awaiting review",
    icon: CheckCircle,
    color: "text-amber-600",
  },
  {
    title: "Today's Orders",
    value: "156",
    description: "Buy/sell transactions",
    icon: ArrowLeftRight,
    color: "text-green-600",
  },
  {
    title: "AUM",
    value: "PHP 84.5B",
    description: "Assets under management",
    icon: TrendingUp,
    color: "text-purple-600",
  },
];

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Read user name from localStorage
  let userName = "Operator";
  try {
    const stored = localStorage.getItem("trustoms-user");
    if (stored) {
      const user = JSON.parse(stored);
      userName = user.name || user.email || "Operator";
    }
  } catch {
    // ignore
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back, {userName}
        </h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Dashboard widgets, charts, and quick-action panels will be added in
            subsequent phases. Use the sidebar navigation to explore master data,
            reference data, operations, compliance, analytics, and tools.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
