import { testYouTubeConnection } from '../../../../lib/publishingGateway.js';

export async function GET() {
  try {
    const result = await testYouTubeConnection();
    return Response.json({ success: result.ok, result }, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
