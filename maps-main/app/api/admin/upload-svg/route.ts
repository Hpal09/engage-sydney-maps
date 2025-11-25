import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// POST /api/admin/upload-svg - Upload SVG file
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate SVG file
    if (!file.name.endsWith('.svg')) {
      return NextResponse.json(
        { error: 'Only SVG files are allowed' },
        { status: 400 }
      );
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;

    // Save to public/maps directory
    const filepath = join(process.cwd(), 'public', 'maps', filename);
    await writeFile(filepath, buffer);

    // Extract viewBox from SVG
    const svgContent = buffer.toString('utf-8');
    const viewBoxMatch = svgContent.match(/viewBox\s*=\s*"([^"]+)"/i);
    let viewBox = null;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
      if (parts.length === 4) {
        viewBox = {
          minX: parts[0],
          minY: parts[1],
          width: parts[2],
          height: parts[3],
        };
      }
    }

    // Return path relative to public directory
    const svgPath = `/maps/${filename}`;

    return NextResponse.json({
      svgPath,
      filename,
      viewBox,
    });
  } catch (error) {
    console.error('Error uploading SVG:', error);
    return NextResponse.json(
      { error: 'Failed to upload SVG' },
      { status: 500 }
    );
  }
}
