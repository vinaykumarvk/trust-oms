import 'dotenv/config';

type SmokeResult = {
  name: string;
  ok: boolean;
  status?: number;
  detail?: string;
};

const APP_ID = 'trustoms';

const featureBaseUrl = process.env.PLATFORM_FEATURE_SERVICE_URL?.replace(/\/$/, '');
const featureApiKey = process.env.PLATFORM_FEATURE_API_KEY ?? '';
const intelligenceBaseUrl = process.env.PLATFORM_INTELLIGENCE_SERVICE_URL?.replace(/\/$/, '');
const intelligenceApiKey = process.env.PLATFORM_INTELLIGENCE_API_KEY ?? '';

async function requestJson(
  name: string,
  url: string,
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<SmokeResult> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        name,
        ok: false,
        status: res.status,
        detail: body.slice(0, 240) || res.statusText,
      };
    }

    return { name, ok: true, status: res.status };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function smokeFeatureService(): Promise<SmokeResult[]> {
  if (!featureBaseUrl) {
    return [{ name: 'feature:configured', ok: false, detail: 'PLATFORM_FEATURE_SERVICE_URL is not set' }];
  }

  const headers = { 'X-API-Key': featureApiKey };
  const entityGlobalId = `${APP_ID}:1`;

  return Promise.all([
    requestJson('feature:health', `${featureBaseUrl}/health`, headers),
    requestJson(
      'feature:definitions',
      `${featureBaseUrl}/api/v1/definitions?app_id=${APP_ID}`,
      headers,
    ),
    requestJson(
      'feature:latest-user',
      `${featureBaseUrl}/api/v1/features/latest?entity_global_id=${encodeURIComponent(entityGlobalId)}`,
      headers,
    ),
  ]);
}

async function smokeIntelligenceService(): Promise<SmokeResult[]> {
  if (!intelligenceBaseUrl) {
    return [{
      name: 'intelligence:configured',
      ok: false,
      detail: 'PLATFORM_INTELLIGENCE_SERVICE_URL is not set',
    }];
  }

  const headers = {
    'X-API-Key': intelligenceApiKey,
    'X-App-ID': APP_ID,
  };

  return Promise.all([
    requestJson('intelligence:health', `${intelligenceBaseUrl}/health`, headers),
    requestJson(
      'intelligence:briefing',
      `${intelligenceBaseUrl}/api/v1/agents/briefing`,
      headers,
      {
        method: 'POST',
        body: JSON.stringify({ app_id: APP_ID, rm_id: 1 }),
      },
    ),
    requestJson(
      'intelligence:nba',
      `${intelligenceBaseUrl}/api/v1/nba`,
      headers,
      {
        method: 'POST',
        body: JSON.stringify({ app_id: APP_ID, rm_id: 1, limit: 3 }),
      },
    ),
    requestJson(
      'intelligence:call-notes',
      `${intelligenceBaseUrl}/api/v1/call-notes`,
      headers,
      {
        method: 'POST',
        body: JSON.stringify({
          app_id: APP_ID,
          report_id: 'smoke-test',
          text: 'Client requested a portfolio review, discussed liquidity needs, and agreed to a follow-up meeting.',
          client_id: `${APP_ID}:CLT-SMOKE`,
        }),
      },
    ),
  ]);
}

function printResults(results: SmokeResult[]) {
  for (const result of results) {
    const status = result.status ? ` HTTP ${result.status}` : '';
    const detail = result.detail ? ` - ${result.detail}` : '';
    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${status}${detail}`);
  }
}

async function main() {
  const results = [
    ...(await smokeFeatureService()),
    ...(await smokeIntelligenceService()),
  ];

  printResults(results);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
