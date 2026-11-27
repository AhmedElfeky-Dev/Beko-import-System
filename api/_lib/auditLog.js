import { run } from './db.js';

/**
 * Log an action to the audit_logs table.
 * Silently swallows errors so it never breaks the main request.
 */
export async function logAction(user, action, entityType, entityId, details = null) {
  try {
    await run(
      `INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user?.id || null,
        user?.email || null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error('Audit log error (non-fatal):', err.message);
  }
}
