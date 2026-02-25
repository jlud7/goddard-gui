import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ALLOWED_ROOT = '/Users/goddard/clawd';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  const authParam = req.nextUrl.searchParams.get('auth') || '';
  const authHeader = req.headers.get('x-dashboard-auth') || '';

  if (!dashPassword || (authParam !== dashPassword && authHeader !== dashPassword)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  const relativePath = pathSegments.join('/');
  const fullPath = resolve(join(ALLOWED_ROOT, relativePath));

  // Security: ensure path is under allowed root
  if (!fullPath.startsWith(ALLOWED_ROOT)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const data = readFileSync(fullPath);
    const ext = '.' + (relativePath.split('.').pop() || '').toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentType.startsWith('image/') || contentType === 'application/pdf'
          ? 'inline'
          : `attachment; filename="${relativePath.split('/').pop()}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Read error' }, { status: 500 });
  }
}
