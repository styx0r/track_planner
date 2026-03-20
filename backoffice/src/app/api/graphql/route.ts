import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3333';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Handle multipart form data (file uploads)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();

      // Parse the operations field
      const operationsStr = formData.get('operations') as string;
      if (!operationsStr) {
        return NextResponse.json(
          { errors: [{ message: 'Missing operations field' }] },
          { status: 400 }
        );
      }

      const operations = JSON.parse(operationsStr);
      const { variables } = operations;

      // Create a new FormData for the backend
      const backendFormData = new FormData();

      // Add audio file
      const file = formData.get('file') as File;
      if (file) backendFormData.append('file', file);

      // Add all sheet music files (supports multiple)
      const allEntries = Array.from(formData.entries());
      for (const [key, value] of allEntries) {
        if (key === 'sheetMusic' && value instanceof File) {
          backendFormData.append('sheetMusic', value);
        }
      }

      // Add all form fields from createMusicInput
      Object.entries(variables.createMusicInput).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          backendFormData.append(key, String(value));
        }
      });

      // Use REST endpoint instead of GraphQL for file uploads
      const response = await fetch(`${BACKEND_URL}/api/music/upload`, {
        method: 'POST',
        body: backendFormData,
      });

      const data = await response.json();
      // Wrap in GraphQL response format
      return NextResponse.json({ data: { createMusic: data } });
    }

    // Handle regular GraphQL queries
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('GraphQL proxy error:', error);
    return NextResponse.json(
      { errors: [{ message: `Internal server error: ${error}` }] },
      { status: 500 }
    );
  }
}
