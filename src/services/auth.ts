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
