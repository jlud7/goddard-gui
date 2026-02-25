import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = 'http://127.0.0.1:18789';

function checkAuth(req: NextRequest): boolean {
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashPassword) return false;
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

  const gatewayToken = process.env.GATEWAY_TOKEN;
  if (!gatewayToken) {
    return NextResponse.json(
      { ok: false, error: { message: 'Gateway token not configured' } },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const fetchRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: body.messages,
        stream: true,
      }),
    });

    if (!fetchRes.ok) {
      const text = await fetchRes.text();
      return NextResponse.json(
        { ok: false, error: { message: `Gateway error: ${text.slice(0, 200)}` } },
        { status: fetchRes.status }
      );
    }

    // Pass through the SSE stream
    return new NextResponse(fetchRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Stream error';
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 502 }
    );
  }
}
