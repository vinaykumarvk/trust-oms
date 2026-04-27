import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Badge } from "@ui/components/ui/badge";
import { Skeleton } from "@ui/components/ui/skeleton";
import { Activity, BarChart3, WifiOff } from "lucide-react";
import { apiRequest } from "@ui/lib/queryClient";
import { apiUrl } from "@ui/lib/api-url";
import { cn } from "@ui/lib/utils";

interface FeatureValue {
  feature_id: string;
  numeric_value: number | string | null;
  boolean_value: boolean | null;
  text_value: string | null;
  timestamp_value: string | null;
  json_value: unknown | null;
  value_type: string;
  as_of_ts: string;
  computed_at: string;
}

interface FeatureResponse {
  entity_type: string;
  entity_id: string;
  features: Record<string, FeatureValue>;
}

interface EntityFeaturePanelProps {
  entityType: "user" | "client" | "portfolio" | string;
  entityId: string | number | null | undefined;
  title: string;
  description?: string;
  featureIds?: string[];
  className?: string;
  limit?: number;
}

const numberFormatter = new Intl.NumberFormat("en-PH", {
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function labelFor(featureId: string) {
  return featureId
    .split(".")
    .pop()
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? featureId;
}

function formatFeatureValue(feature: FeatureValue) {
  const id = feature.feature_id.toLowerCase();

  if (feature.numeric_value !== null && feature.numeric_value !== undefined) {
    const numeric = Number(feature.numeric_value);
    if (!Number.isFinite(numeric)) return String(feature.numeric_value);
    if (id.includes("aum") || id.includes("market_value") || id.includes("amount")) {
      return currencyFormatter.format(numeric);
    }
    if (id.includes("pct") || id.includes("percent") || id.includes("return")) {
      return `${numberFormatter.format(numeric)}%`;
    }
    return numberFormatter.format(numeric);
  }

  if (feature.boolean_value !== null && feature.boolean_value !== undefined) {
    return feature.boolean_value ? "Yes" : "No";
  }

  if (feature.text_value) return feature.text_value;

  if (feature.timestamp_value) {
    return new Date(feature.timestamp_value).toLocaleDateString("en-PH");
  }

  if (feature.json_value !== null && feature.json_value !== undefined) {
    return JSON.stringify(feature.json_value);
  }

  return "-";
}

function sortFeatures(features: FeatureValue[], preferredIds: string[] = []) {
  const preferred = new Map(preferredIds.map((id, index) => [id, index]));
  return [...features].sort((a, b) => {
    const aRank = preferred.get(a.feature_id) ?? Number.MAX_SAFE_INTEGER;
    const bRank = preferred.get(b.feature_id) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.feature_id.localeCompare(b.feature_id);
  });
}

export function EntityFeaturePanel({
  entityType,
  entityId,
  title,
  description,
  featureIds,
  className,
  limit = 6,
}: EntityFeaturePanelProps) {
  const featureQuery = useQuery<FeatureResponse | null>({
    queryKey: ["entity-features", entityType, entityId, featureIds?.join(",")],
    enabled: !!entityType && entityId !== null && entityId !== undefined && entityId !== "",
    retry: false,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const params = featureIds?.length
        ? `?features=${encodeURIComponent(featureIds.join(","))}`
        : "";
      try {
        return await apiRequest(
          "GET",
          apiUrl(`/api/v1/features/${entityType}/${entityId}${params}`),
        );
      } catch {
        return null;
      }
    },
  });

  const features = useMemo(() => {
    const values = Object.values(featureQuery.data?.features ?? {});
    return sortFeatures(values, featureIds).slice(0, limit);
  }, [featureIds, featureQuery.data?.features, limit]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="text-xs">{description}</CardDescription>
            )}
          </div>
          {featureQuery.data === null && !featureQuery.isLoading ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-xs">
              <Activity className="h-3 w-3" />
              Features
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {featureQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: Math.min(limit, 6) }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : features.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.feature_id}
                className={cn(
                  "rounded-md border border-border/60 bg-muted/20 px-3 py-2.5",
                  "min-w-0",
                )}
              >
                <p className="truncate text-xs text-muted-foreground">
                  {labelFor(feature.feature_id)}
                </p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {formatFeatureValue(feature)}
                </p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  As of {new Date(feature.as_of_ts || feature.computed_at).toLocaleString("en-PH")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No computed features are available for this record yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
