import { testInstagramConnection } from '../../../../lib/publishingGateway.js';

export async function POST() {
  try {
    const result = await testInstagramConnection();
    return Response.json({ success: result.ok, result }, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
