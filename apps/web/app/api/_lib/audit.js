import { makeId } from './db';

export async function writeAudit(client, { type, actor, message, metadata = {} }) {
  await client.query(
    'INSERT INTO audit_logs (id, type, actor, message, metadata) VALUES ($1, $2, $3, $4, $5)',
    [makeId('audit'), type, actor || 'system', message, metadata]
  );
}
