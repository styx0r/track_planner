import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3333';

// Proxy handler for music sheet management endpoints:
//   POST   /api/music/:uid/sheets       -> add sheets (multipart)
//   DELETE /api/music/:uid/sheets/:sheetUid -> delete sheet
//   PATCH  /api/music/:uid/sheets/reorder  -> reorder sheets

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = path.join('/');
  const backendUrl = `${BACKEND_URL}/api/music/${backendPath}`;

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Forward multipart as-is (adding sheets to existing song)
      const formData = await request.formData();
      const response = await fetch(backendUrl, {
        method: request.method,
        body: formData,
      });
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    // JSON body (reorder, delete)
    const body = request.method !== 'DELETE' ? await request.text() : undefined;
    const response = await fetch(backendUrl, {
      method: request.method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body || undefined,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Music API proxy error:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error}` },
      { status: 500 }
    );
  }
}

export const POST = handler;
export const DELETE = handler;
export const PATCH = handler;
