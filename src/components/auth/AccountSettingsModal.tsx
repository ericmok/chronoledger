import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Key,
  Terminal,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  Lock,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  changePassword,
  getApiTokens,
  createApiToken,
  revokeApiToken,
  type UserProfile,
  type ApiTokenItem,
  type CreatedApiToken,
} from '../../services/auth';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
}

export function AccountSettingsModal({ isOpen, onClose, currentUser }: AccountSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'security' | 'tokens'>('security');

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // API Tokens State
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Fetch tokens when opening tokens tab
  useEffect(() => {
    if (isOpen && activeTab === 'tokens') {
      loadTokens();
    }
  }, [isOpen, activeTab]);

  const loadTokens = async () => {
    setTokensLoading(true);
    setTokenError(null);
    const res = await getApiTokens();
    setTokensLoading(false);
    if (res.ok) {
      setTokens(res.tokens);
    } else {
      setTokenError(res.error || 'Failed to load API tokens');
    }
  };

  if (!isOpen || !currentUser) return null;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    const res = await changePassword(currentPassword, newPassword);
    setPasswordLoading(false);

    if (res.ok) {
      setPasswordSuccess('Password successfully changed. Other device sessions have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(res.error || 'Failed to update password');
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    setIsCreatingToken(true);
    setTokenError(null);
    const res = await createApiToken(newTokenName.trim());
    setIsCreatingToken(false);

    if (res.ok && res.token) {
      setCreatedToken(res.token);
      setNewTokenName('');
      loadTokens();
    } else {
      setTokenError(res.error || 'Failed to generate token');
    }
  };

  const handleRevokeToken = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to revoke this API token? Any connected MCP assistants or tools will lose access.');
    if (!confirmed) return;

    const res = await revokeApiToken(id);
    if (res.ok) {
      setTokens((prev) => prev.filter((t) => t.id !== id));
      if (createdToken?.id === id) {
        setCreatedToken(null);
      }
    } else {
      setTokenError(res.error || 'Failed to revoke token');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#FAF8F5] border border-[#E2DDD3] rounded-2xl shadow-2xl p-6 sm:p-7 text-[#2B2C30] max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded-lg transition-colors cursor-pointer"
          title="Close Settings"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pb-5 border-b border-[#E8E3D9]">
          <div className="w-10 h-10 rounded-xl bg-[#F0ECE1] border border-[#E2DDD3] flex items-center justify-center text-[#2B2C30]">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-serif font-semibold text-[#2B2C30]">Account & Security</h2>
            <p className="text-xs text-stone-500 font-mono">{currentUser.email}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-[#EFECE6] p-1 rounded-xl my-4 border border-[#E2DDD3]">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex-1 py-1.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'security'
                ? 'bg-white text-[#2B2C30] shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Lock size={15} />
            Password & Security
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tokens')}
            className={`flex-1 py-1.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'tokens'
                ? 'bg-white text-[#2B2C30] shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <Terminal size={15} />
            MCP & API Tokens
          </button>
        </div>

        {/* Tab Content (Scrollable) */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="text-xs text-stone-600 leading-relaxed">
                Update your account master password. For security, changing your password automatically revokes any
                active sessions on other computers and mobile devices.
              </div>

              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2.5">
                  <Check size={16} className="text-emerald-600 shrink-0" />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2.5">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Current Password</label>
                <div className="relative">
                  <Key size={15} className="absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#DDD6C8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8C827A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">New Password (min 6 characters)</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#DDD6C8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8C827A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-[#DDD6C8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8C827A]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 bg-[#2B2C30] hover:bg-[#3E4046] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading && <RefreshCw size={13} className="animate-spin" />}
                  Change Password
                </button>
              </div>
            </form>
          )}

          {activeTab === 'tokens' && (
            <div className="space-y-4">
              <div className="text-xs text-stone-600 leading-relaxed">
                Personal Access Tokens allow Model Context Protocol (MCP) servers, IDE extensions, and automated scripts
                to interact with your calendar securely without giving them your primary account password.
              </div>

              {tokenError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2.5">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{tokenError}</span>
                </div>
              )}

              {/* Newly Created Token Display */}
              {createdToken && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-900">Your New Personal Access Token</span>
                    <span className="text-[10px] text-amber-700 font-medium">Copy now; shown only once</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdToken.token}
                      className="flex-1 font-mono text-xs p-1.5 bg-white border border-amber-300 rounded text-stone-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdToken.token)}
                      className="px-2.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {copiedToken ? <Check size={14} /> : <Copy size={14} />}
                      {copiedToken ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="text-[11px] text-amber-800 font-mono bg-amber-100/60 p-2 rounded border border-amber-200/60">
                    <div>MCP Config (`claude_desktop_config.json`):</div>
                    <pre className="text-[10px] overflow-x-auto mt-1 text-stone-700">
{`"env": {
  "CHRONOLEDGER_TOKEN": "${createdToken.token}"
}`}
                    </pre>
                  </div>
                </div>
              )}

              {/* Create Token Form */}
              <form onSubmit={handleCreateToken} className="p-3 bg-[#F2EDE4]/60 border border-[#DDD6C8] rounded-xl flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Token name (e.g. Claude Desktop, Antigravity)"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#DDD6C8] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8C827A]"
                />
                <button
                  type="submit"
                  disabled={isCreatingToken || !newTokenName.trim()}
                  className="px-3 py-1.5 bg-[#2B2C30] hover:bg-[#3E4046] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  Generate Token
                </button>
              </form>

              {/* Tokens List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider font-mono">
                  Active Tokens ({tokens.length})
                </h3>
                {tokensLoading ? (
                  <div className="text-center py-4 text-xs text-stone-500 font-mono">Loading tokens...</div>
                ) : tokens.length === 0 ? (
                  <div className="text-center py-6 bg-white/50 border border-dashed border-[#DDD6C8] rounded-xl text-xs text-stone-500">
                    No Personal Access Tokens created yet.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {tokens.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-2.5 bg-white border border-[#E5DFD5] rounded-xl text-xs"
                      >
                        <div>
                          <div className="font-medium text-[#2B2C30]">{t.name}</div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            Created {new Date(t.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevokeToken(t.id)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Revoke token"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
