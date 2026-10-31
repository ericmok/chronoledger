export interface UserProfile {
  id: string;
  email: string;
  createdAt?: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: UserProfile | null;
  totalUsers: number;
  unclaimedCount: number;
  isFirstSetup?: boolean;
}

export interface AuthResult {
  ok: boolean;
  user?: UserProfile;
  token?: string;
  migratedCount?: {
    notes: number;
    weekNotes: number;
    monthNotes: number;
    drawings: number;
    circledDates: number;
    settings: number;
  };
  error?: string;
}

export async function checkAuthSession(): Promise<AuthSessionResponse> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    if (!res.ok) {
      return { authenticated: false, user: null, totalUsers: 0, unclaimedCount: 0 };
    }
    return (await res.json()) as AuthSessionResponse;
  } catch (err) {
    console.debug('[Auth] Check session failed:', err);
    return { authenticated: false, user: null, totalUsers: 0, unclaimedCount: 0 };
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, clientName: 'Web Browser' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Login failed' };
    }
    return { ok: true, user: data.user, token: data.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function registerUser(email: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, clientName: 'Web Browser' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Registration failed' };
    }
    return {
      ok: true,
      user: data.user,
      token: data.token,
      migratedCount: data.migratedCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function logoutUser(): Promise<{ ok: boolean }> {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    return (await res.json()) as { ok: boolean };
  } catch {
    return { ok: false };
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to update password' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export interface ApiTokenItem {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
}

export interface CreatedApiToken {
  id: string;
  name: string;
  scopes: string[];
  token: string;
  createdAt: string;
}

export async function getApiTokens(): Promise<{ ok: boolean; tokens: ApiTokenItem[]; error?: string }> {
  try {
    const res = await fetch('/api/auth/tokens', {
      method: 'GET',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, tokens: [], error: data.error || 'Failed to fetch tokens' };
    }
    return { ok: true, tokens: data.tokens || [] };
  } catch (err) {
    return { ok: false, tokens: [], error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function createApiToken(
  name: string,
  scopes: string = 'calendar:read,calendar:write'
): Promise<{ ok: boolean; token?: CreatedApiToken; error?: string }> {
  try {
    const res = await fetch('/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, scopes }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to generate token' };
    }
    return {
      ok: true,
      token: {
        id: data.id,
        name: data.name,
        scopes: data.scopes || [],
        token: data.token,
        createdAt: data.createdAt,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function revokeApiToken(tokenId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/auth/tokens/${encodeURIComponent(tokenId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || 'Failed to revoke token' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
