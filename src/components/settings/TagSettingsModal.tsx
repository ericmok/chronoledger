import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Plus, Trash2, Check, Tag as TagIcon, Sparkles } from 'lucide-react';
import {
  getTagDefinitions,
  saveTagDefinition,
  resetTagDefinition,
  type UserTagDefinition,
} from '../../services/tagService';
import { CANONICAL_COLOR_LIST } from '../../utils/canonicalColors';
import { CORE_TAG_PROTOTYPES } from '../../utils/tagPrototypes';

interface TagSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDefinitionsUpdated?: () => void;
}

export const TagSettingsModal: React.FC<TagSettingsModalProps> = ({
  isOpen,
  onClose,
  onDefinitionsUpdated,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, UserTagDefinition>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeColorPickerTag, setActiveColorPickerTag] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // New tag form
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(CANONICAL_COLOR_LIST[0].solid);
  const [newTagNotable, setNewTagNotable] = useState(true);
  const [newTagPriority, setNewTagPriority] = useState(3);
  const [formError, setFormError] = useState<string | null>(null);

  // Load tag definitions when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDefinitions();
    }
  }, [isOpen]);

  // Native <dialog> lifecycle
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const loadDefinitions = async () => {
    setIsLoading(true);
    const defs = await getTagDefinitions();
    setDefinitions(defs);
    setIsLoading(false);
  };

  const handleUpdateColor = async (tagName: string, color: string) => {
    const existing = definitions[tagName];
    if (!existing) return;

    // Optimistic UI update
    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], color },
    }));
    setActiveColorPickerTag(null);

    const res = await saveTagDefinition(tagName, {
      color,
      notable: existing.notable,
      gutterPriority: existing.gutterPriority,
      isCore: existing.isCore,
    });

    if (res.ok) {
      setStatusMessage(`Updated @${tagName} color. Existing notes updated.`);
      setTimeout(() => setStatusMessage(null), 3000);
      onDefinitionsUpdated?.();
    } else {
      loadDefinitions(); // Revert on failure
    }
  };

  const handleToggleNotable = async (tagName: string) => {
    const existing = definitions[tagName];
    if (!existing) return;

    const nextNotable = existing.notable === 1 ? 0 : 1;
    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], notable: nextNotable },
    }));

    const res = await saveTagDefinition(tagName, {
      color: existing.color,
      notable: nextNotable,
      gutterPriority: existing.gutterPriority,
      isCore: existing.isCore,
    });

    if (res.ok) {
      onDefinitionsUpdated?.();
    } else {
      loadDefinitions();
    }
  };

  const handleUpdatePriority = async (tagName: string, gutterPriority: number) => {
    const existing = definitions[tagName];
    if (!existing) return;

    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], gutterPriority },
    }));

    const res = await saveTagDefinition(tagName, {
      color: existing.color,
      notable: existing.notable,
      gutterPriority,
      isCore: existing.isCore,
    });

    if (res.ok) {
      onDefinitionsUpdated?.();
    } else {
      loadDefinitions();
    }
  };

  const handleResetTag = async (tagName: string) => {
    const res = await resetTagDefinition(tagName);
    if (res.ok) {
      await loadDefinitions();
      setStatusMessage(`Reset @${tagName} to factory stationery defaults.`);
      setTimeout(() => setStatusMessage(null), 3000);
      onDefinitionsUpdated?.();
    }
  };

  const handleCreateCustomTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const sanitized = newTagName.trim().toLowerCase().replace(/^@/, '');
    if (!sanitized) {
      setFormError('Tag name is required');
      return;
    }
    if (!/^[a-z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+$/.test(sanitized)) {
      setFormError('Tag name can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    const res = await saveTagDefinition(sanitized, {
      color: newTagColor,
      notable: newTagNotable ? 1 : 0,
      gutterPriority: newTagPriority,
      isCore: 0,
    });

    if (res.ok) {
      setNewTagName('');
      setFormError(null);
      await loadDefinitions();
      setStatusMessage(`Created custom tag @${sanitized}!`);
      setTimeout(() => setStatusMessage(null), 3000);
      onDefinitionsUpdated?.();
    } else {
      setFormError(res.error || 'Failed to create tag');
    }
  };

  if (!isOpen) return null;

  const sortedTags = Object.values(definitions).sort((a, b) => {
    // Core tags first, then custom tags alphabetically
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return a.tag.localeCompare(b.tag);
  });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tag-settings-title"
      onClose={onClose}
      onClick={(e) => {
        // Light dismiss on backdrop click
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 m-auto w-full max-w-2xl max-h-[90vh] bg-[#FAF8F5] border border-[#DDD6C8] rounded-2xl shadow-2xl p-0 overflow-hidden backdrop:bg-black/40 backdrop:backdrop-blur-xs overscroll-contain"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5DFD5] bg-[#F2EDE4]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2B2C30] flex items-center justify-center text-[#FAF8F5]">
            <TagIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 id="tag-settings-title" className="font-serif text-lg font-bold text-[#2B2C30] tracking-tight">
              Tag Prototypes & Stationery Settings
            </h2>
            <p className="text-xs text-[#7E7F85] font-sans">
              Customize ink swatches, gutter dots, and write-time defaults across your ledger
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-[#7E7F85] hover:text-[#2B2C30] hover:bg-[#EAE3D6] transition-colors cursor-pointer"
          title="Close (Esc)"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="px-6 py-2 bg-[#51C391]/15 text-[#1D7446] border-b border-[#51C391]/30 text-xs font-medium flex items-center gap-1.5 animate-in fade-in">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Modal Content */}
      <div className="p-6 overflow-y-auto max-h-[calc(90vh-130px)] space-y-6">
        {/* Tag List */}
        <div>
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#7E7F85] mb-3">
            Active Tag Definitions ({sortedTags.length})
          </h3>

          {isLoading ? (
            <div className="py-8 text-center text-xs font-mono text-[#A19D94]">Loading tag prototypes...</div>
          ) : (
            <div className="divide-y divide-[#E5DFD5] border border-[#E5DFD5] rounded-xl bg-white/70 overflow-hidden">
              {sortedTags.map((def) => {
                const coreProto = CORE_TAG_PROTOTYPES[def.tag.toLowerCase()];
                const isModified = coreProto && (coreProto.color !== def.color || (coreProto.notable ? 1 : 0) !== def.notable || coreProto.gutterPriority !== def.gutterPriority);
                const isCustom = !def.isCore;

                return (
                  <div key={def.tag} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF8F5]/80 transition-colors">
                    {/* Left: Tag Badge & Color Indicator */}
                    <div className="flex items-center gap-3">
                      {/* Swatch Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveColorPickerTag(activeColorPickerTag === def.tag ? null : def.tag)}
                          className="w-7 h-7 rounded-full border-2 border-white shadow-xs transition-transform hover:scale-110 cursor-pointer flex items-center justify-center shrink-0"
                          style={{ backgroundColor: def.color }}
                          title={`Click to change ink color for @${def.tag}`}
                        >
                          <span className="w-2 h-2 rounded-full bg-white/60" />
                        </button>

                        {/* Inline Color Palette Popover */}
                        {activeColorPickerTag === def.tag && (
                          <div
                            className="absolute left-0 top-9 z-20 p-2 bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-xl flex gap-1.5 flex-wrap w-48 animate-in zoom-in-95 duration-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {CANONICAL_COLOR_LIST.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleUpdateColor(def.tag, c.solid)}
                                className={`w-5 h-5 rounded-full border border-black/10 transition-transform cursor-pointer ${
                                  def.color.toLowerCase() === c.solid.toLowerCase() ? 'scale-125 ring-2 ring-[#2B2C30]' : 'hover:scale-110'
                                }`}
                                style={{ backgroundColor: c.solid }}
                                title={`${c.label}: ${c.description}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Tag Name Badge */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold font-sans leading-none"
                            style={{
                              backgroundColor: `${def.color}25`,
                              color: def.color,
                            }}
                          >
                            @{def.tag}
                          </span>
                          {isCustom && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#EAE3D6] text-[#6B6C72]">
                              custom
                            </span>
                          )}
                          {isModified && (
                            <span className="text-[10px] font-mono text-[#D97706] bg-[#D97706]/10 px-1 py-0.2 rounded">
                              modified
                            </span>
                          )}
                        </div>
                        {def.defaultStatus && (
                          <p className="text-[11px] text-[#A19D94] font-mono mt-0.5">
                            default status: {def.defaultStatus}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Controls (Notable toggle, Gutter Priority, Reset) */}
                    <div className="flex items-center gap-4 text-xs">
                      {/* Notable Toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-[#2B2C30] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={def.notable === 1}
                          onChange={() => handleToggleNotable(def.tag)}
                          className="rounded border-[#DDD6C8] text-[#2B2C30] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[#6B6C72]">Notable Dot</span>
                      </label>

                      {/* Gutter Priority */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-mono text-[#7E7F85]">Gutter:</span>
                        <select
                          value={def.gutterPriority}
                          onChange={(e) => handleUpdatePriority(def.tag, parseInt(e.target.value, 10))}
                          className="text-xs font-mono bg-[#F2EDE4] border border-[#DDD6C8] rounded px-1.5 py-0.5 text-[#2B2C30] cursor-pointer"
                          title="Gutter priority: 1 is highest priority when multiple tags share a date"
                        >
                          <option value="1">P1 (Top)</option>
                          <option value="2">P2</option>
                          <option value="3">P3</option>
                          <option value="4">P4</option>
                          <option value="5">P5</option>
                        </select>
                      </div>

                      {/* Reset / Delete Action */}
                      {isCustom ? (
                        <button
                          type="button"
                          onClick={() => handleResetTag(def.tag)}
                          className="p-1 text-[#8C827A] hover:text-[#D23B38] hover:bg-[#D23B38]/10 rounded transition-colors cursor-pointer"
                          title={`Delete custom tag @${def.tag}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : isModified ? (
                        <button
                          type="button"
                          onClick={() => handleResetTag(def.tag)}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono text-[#D97706] hover:bg-[#D97706]/15 rounded transition-colors cursor-pointer"
                          title="Reset to factory stationery defaults"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Custom Tag Form */}
        <div className="border border-[#E5DFD5] rounded-xl p-4 bg-[#F2EDE4]/40">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#2B2C30] mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            <span>Create Custom Tag</span>
          </h3>
          <p className="text-xs text-[#7E7F85] mb-3">
            Add a new tactile stationery tag definition. Custom tags appear in autocomplete and can be queried with selectors like <code className="bg-[#FAF8F5] px-1 py-0.5 rounded border border-[#E5DFD5]">@tag[attr=val]</code>.
          </p>

          <form onSubmit={handleCreateCustomTag} className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-2.5 top-2 text-xs font-mono text-[#A19D94]">@</span>
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value.toLowerCase())}
                placeholder="tag_name (e.g. client, meeting)"
                className="w-full pl-6 pr-3 py-1.5 text-xs font-mono bg-white border border-[#DDD6C8] rounded-lg focus:outline-none focus:border-[#2B2C30] text-[#2B2C30]"
              />
            </div>

            {/* Color Swatch Picker */}
            <div className="flex items-center gap-1 shrink-0">
              {CANONICAL_COLOR_LIST.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setNewTagColor(c.solid)}
                  className={`w-5 h-5 rounded-full border border-black/10 transition-transform cursor-pointer ${
                    newTagColor.toLowerCase() === c.solid.toLowerCase() ? 'scale-125 ring-2 ring-[#2B2C30]' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c.solid }}
                  title={c.label}
                />
              ))}
            </div>

            {/* Notable checkbox */}
            <label className="flex items-center gap-1.5 text-xs text-[#2B2C30] cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={newTagNotable}
                onChange={(e) => setNewTagNotable(e.target.checked)}
                className="rounded border-[#DDD6C8] text-[#2B2C30] cursor-pointer"
              />
              <span className="text-[#6B6C72]">Notable</span>
            </label>

            {/* Gutter Priority */}
            <select
              value={newTagPriority}
              onChange={(e) => setNewTagPriority(parseInt(e.target.value, 10))}
              className="text-xs font-mono bg-white border border-[#DDD6C8] rounded px-1.5 py-1 text-[#2B2C30] cursor-pointer shrink-0"
              title="Gutter priority: 1 is top priority in date gutter"
            >
              <option value="1">P1 (Top)</option>
              <option value="2">P2</option>
              <option value="3">P3</option>
              <option value="4">P4</option>
              <option value="5">P5</option>
            </select>

            {/* Submit button */}
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147] transition-colors cursor-pointer shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Tag</span>
            </button>
          </form>

          {formError && (
            <p className="text-xs text-[#D23B38] font-sans mt-2">{formError}</p>
          )}
        </div>
      </div>
    </dialog>
  );
};
