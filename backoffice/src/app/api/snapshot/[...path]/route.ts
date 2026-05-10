import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3333';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = path.join('/');
  const backendUrl = `${BACKEND_URL}/api/snapshot/${backendPath}${request.nextUrl.search}`;

  try {
    const init: RequestInit = { method: request.method };
    const contentType = request.headers.get('content-type') || '';

    if (request.method !== 'GET') {
      if (contentType.includes('multipart/form-data')) {
        init.body = await request.formData();
      } else {
        const body = await request.text();
        if (body) {
          init.headers = { 'Content-Type': 'application/json' };
          init.body = body;
        }
      }
    }

    const response = await fetch(backendUrl, init);
    const responseContentType = response.headers.get('content-type') || '';

    if (responseContentType.includes('application/json')) {
      return NextResponse.json(await response.json(), { status: response.status });
    }

    const headers = new Headers();
    const disposition = response.headers.get('content-disposition');
    if (responseContentType) headers.set('content-type', responseContentType);
    if (disposition) headers.set('content-disposition', disposition);

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('Snapshot API proxy error:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error}` },
      { status: 500 }
    );
  }
}

export const GET = handler;
export const POST = handler;
