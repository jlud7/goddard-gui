import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = '/tmp/goddard-gui-uploads';

function checkAuth(req: NextRequest): boolean {
  const dashPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashPassword) return false;
  const authHeader = req.headers.get('x-dashboard-auth') || '';
  return authHeader === dashPassword;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${timestamp}-${safeName}`;
    const filepath = join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filepath, buffer);

    return NextResponse.json({
      ok: true,
      filename,
      path: filepath,
      size: buffer.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
