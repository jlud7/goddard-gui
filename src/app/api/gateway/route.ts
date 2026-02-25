import { NextRequest, NextResponse } from 'next/server';

function checkAuth(req: NextRequest): boolean {
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashPassword) return true; // No password configured = open (shouldn't happen in prod)
  
  const authHeader = req.headers.get('x-dashboard-auth') || '';
  return authHeader === dashPassword;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: { message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const gatewayUrl = (process.env.GATEWAY_URL || '').replace(/\/+$/, '');
  const gatewayToken = process.env.GATEWAY_TOKEN;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json(
      { ok: false, error: { message: `Gateway not configured. URL: ${gatewayUrl ? 'set' : 'missing'}, Token: ${gatewayToken ? 'set' : 'missing'}` } },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { endpoint, ...payload } = body;

    const url = endpoint === 'chat'
      ? `${gatewayUrl}/v1/chat/completions`
      : `${gatewayUrl}/tools/invoke`;

    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(endpoint === 'chat' ? payload : { tool: body.tool, args: body.args }),
    });

    // For streaming chat responses
    if (endpoint === 'chat' && payload.stream) {
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      return new NextResponse(fetchRes.body, { status: 200, headers });
    }

    const text = await fetchRes.text();
    
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: fetchRes.status });
    } catch {
      return NextResponse.json(
        { ok: false, error: { message: `Gateway returned non-JSON (${fetchRes.status}): ${text.slice(0, 200)}` } },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ configured: false, error: 'Unauthorized' }, { status: 401 });
  }
  const gatewayUrl = process.env.GATEWAY_URL;
  const gatewayToken = process.env.GATEWAY_TOKEN;
  return NextResponse.json({
    configured: !!(gatewayUrl && gatewayToken),
    urlSet: !!gatewayUrl,
    tokenSet: !!gatewayToken,
  });
}
