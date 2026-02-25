import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const gatewayUrl = process.env.GATEWAY_URL;
  const gatewayToken = process.env.GATEWAY_TOKEN;

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json(
      { ok: false, error: { message: 'Gateway not configured on server' } },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { endpoint, ...payload } = body;

    const url = endpoint === 'chat'
      ? `${gatewayUrl}/v1/chat/completions`
      : `${gatewayUrl}/tools/invoke`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // For streaming chat responses
    if (endpoint === 'chat' && payload.stream) {
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      return new NextResponse(res.body, { status: 200, headers });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    return NextResponse.json(
      { ok: false, error: { message } },
      { status: 502 }
    );
  }
}
