import React, { useState } from 'react';
import { Mail, Lock, Sparkles, AlertCircle, ArrowRight, X, ShieldCheck } from 'lucide-react';
import { loginUser, registerUser, type UserProfile } from '../../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onAuthSuccess: (user: UserProfile, migratedCount?: Record<string, number>) => void;
  unclaimedCount?: number;
  isFirstSetup?: boolean;
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  unclaimedCount = 0,
  isFirstSetup = false,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(isFirstSetup ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState<Record<string, number> | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const result = await registerUser(email, password);
        if (!result.ok || !result.user) {
          setError(result.error || 'Failed to create account');
          setLoading(false);
          return;
        }

        if (result.migratedCount && Object.values(result.migratedCount).some((c) => c > 0)) {
          setMigrationNotice(result.migratedCount);
          setTimeout(() => {
            onAuthSuccess(result.user!, result.migratedCount);
          }, 1200);
        } else {
          onAuthSuccess(result.user, result.migratedCount);
        }
      } else {
        const result = await loginUser(email, password);
        if (!result.ok || !result.user) {
          setError(result.error || 'Invalid email or password');
          setLoading(false);
          return;
        }
        onAuthSuccess(result.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#FAF8F5] border border-[#E2DDD3] rounded-2xl shadow-2xl p-6 sm:p-8 text-[#2B2C30]">
        {/* Close Button if dismissible */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        )}

        {/* Header Icon & Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#F0ECE1] text-[#2B2C30] border border-[#E2DDD3] mb-3 shadow-inner">
            <ShieldCheck size={24} className="text-[#3A3C42]" />
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-[#2B2C30]">
            {mode === 'login' ? 'Welcome Back to ChronoLedger' : 'Create Your ChronoLedger Account'}
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1 font-sans">
            {mode === 'login'
              ? 'Sign in to sync your notes across devices'
              : 'Your personal, tactile continuous ledger across web and native devices'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-[#EFECE6] p-1 rounded-xl mb-6 border border-[#E2DDD3]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-white text-[#2B2C30] shadow-sm font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-white text-[#2B2C30] shadow-sm font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Migration Banner (if legacy data exists) */}
        {mode === 'register' && unclaimedCount > 0 && (
          <div className="mb-5 p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-start gap-3 text-xs text-emerald-900 leading-relaxed shadow-sm">
            <Sparkles size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-950">Data Migration Guarantee:</span> Found{' '}
              <span className="font-semibold underline">{unclaimedCount} existing notes & markups</span> on
              this ledger. They will be automatically migrated to your new account.
            </div>
          </div>
        )}

        {/* Success Migration Transition Banner */}
        {migrationNotice && (
          <div className="mb-5 p-3.5 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center gap-3 text-xs text-emerald-950 font-medium animate-pulse">
            <Sparkles size={16} className="text-emerald-700" />
            <div>
              Successfully claimed and migrated {migrationNotice.notes ?? 0} notes and timeline markups to your
              account! Loading your calendar...
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-800">
            <AlertCircle size={15} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#DDD6CA] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2B2C30]/20 focus:border-[#2B2C30] transition-colors placeholder:text-stone-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#DDD6CA] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2B2C30]/20 focus:border-[#2B2C30] transition-colors placeholder:text-stone-400"
              />
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-stone-400 mt-1">At least 6 characters</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-[#2B2C30] text-[#FAF8F5] text-sm font-semibold rounded-xl hover:bg-[#3D3E42] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-stone-300 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In to Ledger' : 'Create & Migrate Account'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="mt-6 text-center text-xs text-stone-400">
          Encrypted sessions with high-grade Argon2 verification. Supports web, Rust, and iOS clients.
        </div>
      </div>
    </div>
  );
}
