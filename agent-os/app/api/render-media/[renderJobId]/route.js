import fs from 'fs';
import { readRenderMediaFile, getRenderMediaHealth } from '../../../../lib/renderMediaStore.js';

export async function GET(request, { params }) {
  const redirectUrl =
    String(process.env.PUBLIC_RENDER_PLACEHOLDER_URL || process.env.RENDER_MEDIA_REDIRECT_URL || '').trim();
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'instagram';
  const file = readRenderMediaFile(params.renderJobId, platform);

  if (file) {
    const buffer = fs.readFileSync(file.path);
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Length': String(file.size),
        'Cache-Control': 'public, max-age=60',
        'Content-Disposition': `inline; filename="${file.filename}"`,
      },
    });
  }

  if (redirectUrl) {
    return Response.redirect(redirectUrl, 302);
  }

  return Response.json(
    {
      render_job_id: params.renderJobId,
      platform,
      status: 'placeholder',
      health: getRenderMediaHealth(params.renderJobId, platform),
      message:
        'No local render media file exists yet. Generate a production bundle or set PUBLIC_RENDER_PLACEHOLDER_URL to a hosted MP4.',
    },
    { status: 200 }
  );
}
