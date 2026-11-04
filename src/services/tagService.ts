/**
 * Tag Definitions Client Service
 *
 * Communicates with backend endpoints (/api/tags/definitions) to fetch,
 * update, and reset user tag definitions and prototypes.
 */

import { CORE_TAG_PROTOTYPES } from '../utils/tagPrototypes';

export interface UserTagDefinition {
  tag: string;
  color: string;
  notable: number;
  gutterPriority: number;
  isCore: number;
  defaultStatus?: string;
}

/**
 * Retrieves all user tag definitions from the server, falling back to CORE_TAG_PROTOTYPES.
 */
export async function getTagDefinitions(): Promise<Record<string, UserTagDefinition>> {
  try {
    const res = await fetch('/api/tags/definitions', {
      method: 'GET',
      headers: { credentials: 'same-origin' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.definitions) {
        return data.definitions;
      }
    }
  } catch (err) {
    console.warn('[TagService] Failed to fetch tag definitions from server, using core defaults:', err);
  }

  // Fallback to core prototypes
  const fallback: Record<string, UserTagDefinition> = {};
  for (const [key, proto] of Object.entries(CORE_TAG_PROTOTYPES)) {
    fallback[key.toLowerCase()] = {
      tag: proto.tag,
      color: proto.color,
      notable: proto.notable ? 1 : 0,
      gutterPriority: proto.gutterPriority,
      isCore: proto.isCore ? 1 : 0,
      defaultStatus: proto.defaultStatus,
    };
  }
  return fallback;
}

/**
 * Updates a user tag definition on the server with write-time default propagation.
 */
export async function saveTagDefinition(
  tagName: string,
  updates: {
    color?: string;
    notable?: boolean | number;
    gutterPriority?: number;
    isCore?: boolean | number;
  }
): Promise<{ ok: boolean; error?: string; definition?: UserTagDefinition }> {
  try {
    const res = await fetch(`/api/tags/definitions/${encodeURIComponent(tagName.toLowerCase())}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      const data = await res.json();
      return { ok: true, definition: data };
    } else {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

/**
 * Resets a core tag definition to its original stationery defaults or removes a custom tag.
 */
export async function resetTagDefinition(tagName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/tags/definitions/${encodeURIComponent(tagName.toLowerCase())}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });

    if (res.ok) {
      return { ok: true };
    } else {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
