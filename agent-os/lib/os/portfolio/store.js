// lib/os/portfolio/store.js
function toItem(row) {
  return row ? {
    id: row.id, source: row.source, url: row.url, title: row.title, description: row.description, thumbnailUrl: row.thumbnail_url,
    lane: row.lane, style: row.style, location: row.location, deliverableType: row.deliverable_type, publishedAt: row.published_at,
    tagsConfirmed: row.tags_confirmed === 1, active: row.active === 1,
  } : null;
}

export function createPortfolioStore({ db }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();

  function get(id) {
    return toItem(db.prepare('SELECT * FROM portfolio_items WHERE id = ?').get(Number(id)));
  }

  function upsert(item = {}) {
    const url = String(item.url ?? '').trim();
    const source = String(item.source ?? '').trim();
    if (!url || !source) throw new Error('Portfolio items need a url and a source.');
    const time = stamp();
    const existing = db.prepare('SELECT * FROM portfolio_items WHERE url = ?').get(url);
    if (existing) {
      // A re-import with empty fields never blanks text we already have.
      db.prepare('UPDATE portfolio_items SET title = ?, description = ?, thumbnail_url = ?, deliverable_type = ?, published_at = ?, updated_at = ? WHERE id = ?')
        .run(item.title || existing.title, item.description || existing.description, item.thumbnailUrl || existing.thumbnail_url,
          item.deliverableType || existing.deliverable_type, item.publishedAt || existing.published_at, time, existing.id);
      return { item: get(existing.id), created: false };
    }
    const info = db.prepare(`INSERT INTO portfolio_items (source, url, title, description, thumbnail_url, deliverable_type, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(source, url, item.title || url, item.description ?? '', item.thumbnailUrl ?? '', item.deliverableType ?? '',
        item.publishedAt ?? '', time, time);
    return { item: get(Number(info.lastInsertRowid)), created: true };
  }

  function list({ includeInactive = false } = {}) {
    const sql = `SELECT * FROM portfolio_items ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY published_at DESC, id DESC`;
    return db.prepare(sql).all().map(toItem);
  }

  function untagged(limit = 10) {
    return db.prepare("SELECT * FROM portfolio_items WHERE lane = '' AND tags_confirmed = 0 AND active = 1 ORDER BY id LIMIT ?").all(limit).map(toItem);
  }

  // Suggested tags never replace tags the owner confirmed.
  function setTags(id, { lane, style, location, deliverableType } = {}, { confirmed = false } = {}) {
    const current = get(id);
    if (!current) throw new Error(`No portfolio item ${id}.`);
    if (current.tagsConfirmed && !confirmed) return current;
    // Suggestions never erase with blanks; the owner (confirmed) may blank a field on purpose.
    const pick = (next, old) => (confirmed ? (next ?? old) : (next || old));
    const norm = (value) => (value == null ? value : String(value).trim().toLowerCase());
    db.prepare(`UPDATE portfolio_items SET lane = ?, style = ?, location = ?, deliverable_type = ?, tags_confirmed = ?, updated_at = ? WHERE id = ?`)
      .run(pick(norm(lane), current.lane), pick(norm(style), current.style), pick(location, current.location),
        pick(deliverableType, current.deliverableType),
        confirmed || current.tagsConfirmed ? 1 : 0, stamp(), current.id);
    return get(current.id);
  }

  function setActive(id, active) {
    if (!get(id)) throw new Error(`No portfolio item ${id}.`);
    db.prepare('UPDATE portfolio_items SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, stamp(), Number(id));
    return get(id);
  }

  return { get, upsert, list, untagged, setTags, setActive };
}
