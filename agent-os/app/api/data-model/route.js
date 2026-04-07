import {
  CANONICAL_ENTITIES,
  CANONICAL_EVENT_CHAIN,
  CANONICAL_SCHEMAS,
  CORE_EVENT_NAMES,
  ENTITY_ID_PREFIXES,
  REQUIRED_SYSTEM_FIELDS,
  STATE_MACHINES,
  buildCanonicalDataModelContext,
} from '../../../lib/canonicalDataModel.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  if (format === 'context') {
    return Response.json({ context: buildCanonicalDataModelContext() });
  }

  return Response.json({
    entities: CANONICAL_ENTITIES,
    schemas: CANONICAL_SCHEMAS,
    stateMachines: STATE_MACHINES,
    coreEventNames: CORE_EVENT_NAMES,
    canonicalEventChain: CANONICAL_EVENT_CHAIN,
    idPrefixes: ENTITY_ID_PREFIXES,
    requiredSystemFields: REQUIRED_SYSTEM_FIELDS,
  });
}
