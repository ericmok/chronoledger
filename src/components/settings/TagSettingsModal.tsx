import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Tag as TagIcon,
  Sparkles,
  Sliders,
  ChevronDown,
  ChevronUp,
  Pipette,
} from 'lucide-react';
import {
  getTagDefinitions,
  saveTagDefinition,
  resetTagDefinition,
  type UserTagDefinition,
} from '../../services/tagService';
import { CANONICAL_COLOR_LIST } from '../../utils/canonicalColors';
import {
  CORE_TAG_PROTOTYPES,
  type AttributeStyleRule,
  type ColorStyle,
  type AnimatedStyle,
  type TagBaseStyle,
} from '../../utils/tagPrototypes';
import {
  getWashBgColor,
  getContrastingTextColor,
} from '../../utils/annotationUtils';
import { ColorPickerPopover } from '../common/ColorPickerPopover';

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

  // Attribute Rules State
  const [expandedTagRules, setExpandedTagRules] = useState<string | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [ruleKey, setRuleKey] = useState('');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleColor, setRuleColor] = useState(CANONICAL_COLOR_LIST[0].solid);
  const [ruleColorStyle, setRuleColorStyle] = useState<ColorStyle>('light_on_dark');
  const [ruleBold, setRuleBold] = useState(false);
  const [ruleItalic, setRuleItalic] = useState(false);
  const [ruleDim, setRuleDim] = useState(false);
  const [ruleStrikethrough, setRuleStrikethrough] = useState(false);
  const [ruleAnimatedStyle, setRuleAnimatedStyle] = useState<AnimatedStyle>('none');
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Custom Color Picker Popover Controls
  const [isRuleColorPickerOpen, setIsRuleColorPickerOpen] = useState(false);
  const [isNewTagColorPickerOpen, setIsNewTagColorPickerOpen] = useState(false);
  const ruleColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const newTagColorButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagColorButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdateColor = (tagName: string, color: string) => {
    const existing = definitions[tagName];
    if (!existing) return;

    // 1. Instant optimistic UI update
    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], color },
    }));

    // 2. Debounced persistence to server (300ms) to allow smooth slider dragging
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      const res = await saveTagDefinition(tagName, {
        color,
        notable: existing.notable,
        gutterPriority: existing.gutterPriority,
        isCore: existing.isCore,
      });

      if (res.ok) {
        setStatusMessage(`Updated @${tagName} color.`);
        setTimeout(() => setStatusMessage(null), 3000);
        onDefinitionsUpdated?.();
      } else {
        loadDefinitions(); // Revert on failure
      }
    }, 300);
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

  const handleUpdateBaseStyle = async (tagName: string, updates: Partial<TagBaseStyle>) => {
    const existing = definitions[tagName];
    if (!existing) return;

    const newBaseStyle: TagBaseStyle = {
      ...(existing.baseStyle || {}),
      ...updates,
    };

    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], baseStyle: newBaseStyle },
    }));

    const res = await saveTagDefinition(tagName, {
      color: existing.color,
      notable: existing.notable,
      gutterPriority: existing.gutterPriority,
      isCore: existing.isCore,
      styleRules: existing.styleRules,
      baseStyle: newBaseStyle,
    });

    if (res.ok) {
      onDefinitionsUpdated?.();
    } else {
      loadDefinitions();
    }
  };

  const handleSaveRule = async (tagName: string) => {
    setRuleError(null);
    const trimmedVal = ruleValue.trim().toLowerCase();
    if (!trimmedVal) {
      setRuleError('Attribute value is required (e.g. high, low, wip, done)');
      return;
    }

    const existing = definitions[tagName];
    if (!existing) return;

    const newRule: AttributeStyleRule = {
      id: `rule_${Date.now()}`,
      attrKey: ruleKey.trim().toLowerCase() || undefined,
      attrValue: trimmedVal,
      color: ruleColor,
      colorStyle: ruleColorStyle,
      bold: ruleBold || undefined,
      italic: ruleItalic || undefined,
      dim: ruleDim || undefined,
      strikethrough: ruleStrikethrough || undefined,
      animatedStyle: ruleAnimatedStyle,
    };

    const currentRules = existing.styleRules ? [...existing.styleRules] : [];
    const existingIdx = currentRules.findIndex(
      (r) =>
        (r.attrKey || '').toLowerCase() === (newRule.attrKey || '').toLowerCase() &&
        r.attrValue.toLowerCase() === newRule.attrValue.toLowerCase()
    );

    let updatedRules: AttributeStyleRule[];
    if (existingIdx !== -1) {
      updatedRules = currentRules.map((r, i) => (i === existingIdx ? newRule : r));
    } else {
      updatedRules = [...currentRules, newRule];
    }

    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], styleRules: updatedRules },
    }));

    const res = await saveTagDefinition(tagName, {
      color: existing.color,
      notable: existing.notable,
      gutterPriority: existing.gutterPriority,
      isCore: existing.isCore,
      styleRules: updatedRules,
    });

    if (res.ok) {
      setStatusMessage(`Updated attribute rules for @${tagName}.`);
      setTimeout(() => setStatusMessage(null), 3000);
      setIsAddingRule(false);
      setRuleKey('');
      setRuleValue('');
      setRuleBold(false);
      setRuleItalic(false);
      setRuleDim(false);
      setRuleStrikethrough(false);
      setRuleAnimatedStyle('none');
      onDefinitionsUpdated?.();
    } else {
      loadDefinitions();
    }
  };

  const handleDeleteRule = async (tagName: string, ruleId: string) => {
    const existing = definitions[tagName];
    if (!existing) return;

    const currentRules = existing.styleRules ? [...existing.styleRules] : [];
    const updatedRules = currentRules.filter((r) => r.id !== ruleId);

    setDefinitions((prev) => ({
      ...prev,
      [tagName]: { ...prev[tagName], styleRules: updatedRules },
    }));

    const res = await saveTagDefinition(tagName, {
      color: existing.color,
      notable: existing.notable,
      gutterPriority: existing.gutterPriority,
      isCore: existing.isCore,
      styleRules: updatedRules,
    });

    if (res.ok) {
      setStatusMessage(`Deleted rule for @${tagName}.`);
      setTimeout(() => setStatusMessage(null), 3000);
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
                const isModified =
                  coreProto &&
                  (coreProto.color !== def.color ||
                    (coreProto.notable ? 1 : 0) !== def.notable ||
                    coreProto.gutterPriority !== def.gutterPriority ||
                    JSON.stringify(coreProto.baseStyle || {}) !== JSON.stringify(def.baseStyle || {}) ||
                    JSON.stringify(coreProto.styleRules || []) !== JSON.stringify(def.styleRules || []));
                const isCustom = !def.isCore;
                const baseStyle = def.baseStyle || {};
                const isWash = baseStyle.colorStyle === 'dark_on_light';
                const tagBg = isWash ? getWashBgColor(def.color) : def.color;
                const tagText = isWash ? '#2B2C30' : getContrastingTextColor(def.color);

                return (
                  <div key={def.tag} className="flex flex-col">
                    <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF8F5]/80 transition-colors">
                    {/* Left: Tag Badge & Color Indicator */}
                    <div className="flex items-center gap-3">
                      {/* Swatch Button */}
                      <div className="relative">
                        <button
                          ref={(el) => {
                            tagColorButtonRefs.current[def.tag] = el;
                          }}
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
                          <ColorPickerPopover
                            currentColor={def.color}
                            onSelectColor={(hex) => handleUpdateColor(def.tag, hex)}
                            onClose={() => setActiveColorPickerTag(null)}
                            triggerRef={{ current: tagColorButtonRefs.current[def.tag] }}
                            portalContainer={dialogRef.current}
                          />
                        )}
                      </div>

                      {/* Tag Name Badge & Base Style Toolbar */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs select-none ${
                              baseStyle.bold ? 'font-bold' : 'font-semibold'
                            } ${baseStyle.italic ? 'italic' : ''} ${baseStyle.dim ? 'opacity-60' : ''} ${
                              baseStyle.animatedStyle === 'bounce' ? 'animate-subtle-bounce' : ''
                            } leading-none`}
                            style={{
                              backgroundColor: tagBg,
                              color: tagText,
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

                        {/* Base Tag Style Controls */}
                        <div className="flex items-center gap-1 mt-1 text-[10px] font-mono flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateBaseStyle(def.tag, {
                                colorStyle: isWash ? 'light_on_dark' : 'dark_on_light',
                              })
                            }
                            className={`px-1.5 py-0.2 rounded border transition-colors cursor-pointer ${
                              isWash
                                ? 'bg-[#EAE3D6] text-[#2B2C30] border-[#DDD6C8]'
                                : 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                            }`}
                            title="Toggle base badge style: Solid vs Wash"
                          >
                            {isWash ? 'Wash' : 'Solid'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateBaseStyle(def.tag, { bold: !baseStyle.bold })}
                            className={`px-1.5 py-0.2 rounded border transition-colors cursor-pointer ${
                              baseStyle.bold
                                ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30] font-bold'
                                : 'bg-[#F2EDE4]/60 text-[#7E7F85] border-[#DDD6C8] hover:text-[#2B2C30]'
                            }`}
                            title="Toggle Bold"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateBaseStyle(def.tag, { italic: !baseStyle.italic })}
                            className={`px-1.5 py-0.2 rounded border transition-colors cursor-pointer italic ${
                              baseStyle.italic
                                ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                                : 'bg-[#F2EDE4]/60 text-[#7E7F85] border-[#DDD6C8] hover:text-[#2B2C30]'
                            }`}
                            title="Toggle Italic"
                          >
                            I
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateBaseStyle(def.tag, { dim: !baseStyle.dim })}
                            className={`px-1.5 py-0.2 rounded border transition-colors cursor-pointer ${
                              baseStyle.dim
                                ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                                : 'bg-[#F2EDE4]/60 text-[#7E7F85] border-[#DDD6C8] hover:text-[#2B2C30]'
                            }`}
                            title="Toggle Dim"
                          >
                            Dim
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateBaseStyle(def.tag, {
                                animatedStyle: baseStyle.animatedStyle === 'bounce' ? 'none' : 'bounce',
                              })
                            }
                            className={`px-1.5 py-0.2 rounded border transition-colors cursor-pointer ${
                              baseStyle.animatedStyle === 'bounce'
                                ? 'bg-[#51C391]/25 text-[#1D7446] border-[#51C391] font-semibold'
                                : 'bg-[#F2EDE4]/60 text-[#7E7F85] border-[#DDD6C8] hover:text-[#2B2C30]'
                            }`}
                            title="Toggle subtle harmonic bounce on notes with this tag"
                          >
                            ⚡ Bounce
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: Controls (Notable toggle, Gutter Priority, Rules Drawer, Reset) */}
                    <div className="flex items-center gap-3 text-xs flex-wrap sm:flex-nowrap">
                      {/* Rules Drawer Toggle Button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (expandedTagRules === def.tag) {
                            setExpandedTagRules(null);
                            setIsAddingRule(false);
                          } else {
                            setExpandedTagRules(def.tag);
                            setIsAddingRule(false);
                            setRuleColor(def.color);
                          }
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-colors cursor-pointer ${
                          expandedTagRules === def.tag
                            ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                            : (def.styleRules || []).length > 0
                            ? 'bg-[#EAE3D6] text-[#2B2C30] border-[#DDD6C8] hover:bg-[#DDD6C8]'
                            : 'bg-[#F2EDE4]/60 text-[#7E7F85] border-[#DDD6C8] hover:text-[#2B2C30]'
                        }`}
                        title="Configure attribute variant styles (e.g. priority=high, wip, done)"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Rules ({(def.styleRules || []).length})</span>
                        {expandedTagRules === def.tag ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {/* Notable Toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-[#2B2C30] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={def.notable === 1}
                          onChange={() => handleToggleNotable(def.tag)}
                          className="rounded border-[#DDD6C8] text-[#2B2C30] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-[#6B6C72]">Notable</span>
                      </label>

                      {/* Gutter Priority */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-mono text-[#7E7F85]">P:</span>
                        <select
                          value={def.gutterPriority}
                          onChange={(e) => handleUpdatePriority(def.tag, parseInt(e.target.value, 10))}
                          className="text-xs font-mono bg-[#F2EDE4] border border-[#DDD6C8] rounded px-1.5 py-0.5 text-[#2B2C30] cursor-pointer"
                          title="Gutter priority: 1 is highest priority when multiple tags share a date"
                        >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
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

                  {/* Attribute Rules Accordion Drawer */}
                  {expandedTagRules === def.tag && (
                    <div className="px-4 py-3 bg-[#FAF8F5] border-t border-[#E5DFD5] space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#7E7F85]">
                          Attribute Variant Styles for @{def.tag}
                        </span>
                        {!isAddingRule && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingRule(true);
                              setRuleKey('');
                              setRuleValue('');
                              setRuleColor(def.color);
                              setRuleColorStyle('light_on_dark');
                              setRuleBold(false);
                              setRuleItalic(false);
                              setRuleDim(false);
                              setRuleStrikethrough(false);
                              setRuleAnimatedStyle('none');
                              setRuleError(null);
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147] transition-colors cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Rule</span>
                          </button>
                        )}
                      </div>

                      {/* Existing Rules List */}
                      {(!def.styleRules || def.styleRules.length === 0) && !isAddingRule ? (
                        <p className="text-xs text-[#A19D94] italic font-sans py-1">
                          No attribute rules configured. All notes with @{def.tag} use base stationery styling.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(def.styleRules || []).map((rule) => {
                            const badgeBg =
                              rule.colorStyle === 'dark_on_light'
                                ? getWashBgColor(rule.color || def.color)
                                : (rule.color || def.color);
                            const badgeText =
                              rule.colorStyle === 'dark_on_light'
                                ? '#2B2C30'
                                : getContrastingTextColor(badgeBg);

                            return (
                              <div
                                key={rule.id}
                                className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white border border-[#E5DFD5] shadow-2xs text-xs"
                              >
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  {/* Live Preview Mini Badge */}
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans ${
                                      rule.bold ? 'font-bold' : 'font-semibold'
                                    } ${rule.italic ? 'italic' : ''} ${
                                      rule.dim ? 'opacity-60' : ''
                                    } ${rule.strikethrough ? 'line-through' : ''} ${
                                      rule.animatedStyle === 'bounce' ? 'animate-subtle-bounce' : ''
                                    } select-none`}
                                    style={{
                                      backgroundColor: badgeBg,
                                      color: badgeText,
                                    }}
                                  >
                                    @{def.tag}[{rule.attrKey ? `${rule.attrKey}=${rule.attrValue}` : rule.attrValue}]
                                  </span>

                                  {/* Property Summary Chips */}
                                  <div className="flex items-center gap-1 text-[10px] font-mono text-[#7E7F85]">
                                    <span className="px-1 py-0.2 rounded bg-[#F2EDE4]">
                                      {rule.colorStyle === 'dark_on_light' ? 'Wash' : 'Solid'}
                                    </span>
                                    {rule.bold && <span className="px-1 py-0.2 rounded bg-[#F2EDE4] font-bold">Bold</span>}
                                    {rule.italic && <span className="px-1 py-0.2 rounded bg-[#F2EDE4] italic">Italic</span>}
                                    {rule.dim && <span className="px-1 py-0.2 rounded bg-[#F2EDE4]">Dim</span>}
                                    {rule.strikethrough && <span className="px-1 py-0.2 rounded bg-[#F2EDE4] line-through">Strike</span>}
                                    {rule.animatedStyle === 'bounce' && (
                                      <span className="px-1 py-0.2 rounded bg-[#51C391]/20 text-[#1D7446] font-semibold">
                                        Bounce
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteRule(def.tag, rule.id)}
                                  className="p-1 text-[#8C827A] hover:text-[#D23B38] hover:bg-[#D23B38]/10 rounded transition-colors cursor-pointer shrink-0"
                                  title="Delete this attribute rule"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add/Edit Rule Form */}
                      {isAddingRule && (
                        <div className="p-3 rounded-lg bg-white border border-[#DDD6C8] shadow-sm space-y-3 animate-in zoom-in-95 duration-100">
                          <div className="text-xs font-semibold text-[#2B2C30]">
                            New Attribute Styling Rule
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Attribute Key (Optional) */}
                            <div>
                              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                                Attribute Key (Optional)
                              </label>
                              <input
                                type="text"
                                value={ruleKey}
                                onChange={(e) => setRuleKey(e.target.value)}
                                placeholder="e.g. priority, status (leave blank for any)"
                                className="w-full px-2 py-1 text-xs font-mono bg-[#FAF8F5] border border-[#DDD6C8] rounded focus:outline-none focus:border-[#2B2C30]"
                              />
                            </div>

                            {/* Attribute Value (Required) */}
                            <div>
                              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                                Attribute Value *
                              </label>
                              <input
                                type="text"
                                value={ruleValue}
                                onChange={(e) => setRuleValue(e.target.value)}
                                placeholder="e.g. high, low, wip, done"
                                className="w-full px-2 py-1 text-xs font-mono bg-[#FAF8F5] border border-[#DDD6C8] rounded focus:outline-none focus:border-[#2B2C30]"
                              />
                            </div>
                          </div>

                          {/* Ink Color Selector */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-mono text-[#7E7F85] uppercase">
                                Ink Swatch & Color
                              </label>
                              <span className="font-mono text-[10px] text-[#2B2C30]">{ruleColor}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap relative">
                              {CANONICAL_COLOR_LIST.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setRuleColor(c.solid)}
                                  className={`w-5 h-5 rounded-full border border-black/10 transition-transform cursor-pointer ${
                                    ruleColor.toLowerCase() === c.solid.toLowerCase()
                                      ? 'scale-125 ring-2 ring-[#2B2C30]'
                                      : 'hover:scale-110'
                                  }`}
                                  style={{ backgroundColor: c.solid }}
                                  title={c.label}
                                />
                              ))}

                              {/* Custom Color trigger button */}
                              <div className="relative">
                                <button
                                  ref={ruleColorButtonRef}
                                  type="button"
                                  onClick={() => setIsRuleColorPickerOpen((prev) => !prev)}
                                  className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded border cursor-pointer transition-colors ${
                                    isRuleColorPickerOpen || !CANONICAL_COLOR_LIST.some((c) => c.solid.toLowerCase() === ruleColor.toLowerCase())
                                      ? 'bg-[#2B2C30] text-white border-[#2B2C30]'
                                      : 'bg-white text-[#2B2C30] border-[#DDD6C8] hover:border-[#2B2C30]'
                                  }`}
                                  title="Custom color (Hex, HSL, Eyedropper)"
                                >
                                  <span
                                    className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                                    style={{ backgroundColor: ruleColor }}
                                  />
                                  <span>Custom</span>
                                </button>

                                {isRuleColorPickerOpen && (
                                  <ColorPickerPopover
                                    currentColor={ruleColor}
                                    onSelectColor={(hex) => setRuleColor(hex)}
                                    onClose={() => setIsRuleColorPickerOpen(false)}
                                    triggerRef={ruleColorButtonRef}
                                    portalContainer={dialogRef.current}
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Color Style Toggle & Motion */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-1">
                                Color Style
                              </label>
                              <div className="flex items-center gap-1.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setRuleColorStyle('light_on_dark')}
                                  className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                                    ruleColorStyle === 'light_on_dark'
                                      ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                                      : 'bg-[#F2EDE4] text-[#6B6C72] border-[#DDD6C8]'
                                  }`}
                                >
                                  Solid (Light on Dark)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRuleColorStyle('dark_on_light')}
                                  className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                                    ruleColorStyle === 'dark_on_light'
                                      ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
                                      : 'bg-[#F2EDE4] text-[#6B6C72] border-[#DDD6C8]'
                                  }`}
                                >
                                  Wash (Dark on Light)
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-1">
                                Motion Animation
                              </label>
                              <select
                                value={ruleAnimatedStyle}
                                onChange={(e) => setRuleAnimatedStyle(e.target.value as AnimatedStyle)}
                                className="w-full text-xs font-mono bg-[#FAF8F5] border border-[#DDD6C8] rounded px-2 py-1 text-[#2B2C30] cursor-pointer"
                              >
                                <option value="none">None (Resting)</option>
                                <option value="bounce">Subtle Bounce (Harmonic Bob)</option>
                              </select>
                            </div>
                          </div>

                          {/* Typography Toggles */}
                          <div>
                            <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-1">
                              Typography Options
                            </label>
                            <div className="flex items-center gap-3 text-xs flex-wrap">
                              <label className="flex items-center gap-1 text-[#2B2C30] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ruleBold}
                                  onChange={(e) => setRuleBold(e.target.checked)}
                                  className="rounded border-[#DDD6C8] text-[#2B2C30] cursor-pointer"
                                />
                                <span className="font-bold">Bold</span>
                              </label>
                              <label className="flex items-center gap-1 text-[#2B2C30] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ruleItalic}
                                  onChange={(e) => setRuleItalic(e.target.checked)}
                                  className="rounded border-[#DDD6C8] text-[#2B2C30] cursor-pointer"
                                />
                                <span className="italic">Italic</span>
                              </label>
                              <label className="flex items-center gap-1 text-[#2B2C30] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ruleDim}
                                  onChange={(e) => setRuleDim(e.target.checked)}
                                  className="rounded border-[#DDD6C8] text-[#2B2C30] cursor-pointer"
                                />
                                <span>Dim</span>
                              </label>
                              <label className="flex items-center gap-1 text-[#2B2C30] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ruleStrikethrough}
                                  onChange={(e) => setRuleStrikethrough(e.target.checked)}
                                  className="rounded border-[#DDD6C8] text-[#2B2C30] cursor-pointer"
                                />
                                <span className="line-through">Strikethrough</span>
                              </label>
                            </div>
                          </div>

                          {/* Live Preview Card */}
                          <div className="p-2 rounded bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-[#7E7F85]">Preview:</span>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs select-none ${
                                ruleBold ? 'font-bold' : 'font-semibold'
                              } ${ruleItalic ? 'italic' : ''} ${ruleDim ? 'opacity-60' : ''} ${
                                ruleStrikethrough ? 'line-through' : ''
                              } ${ruleAnimatedStyle === 'bounce' ? 'animate-subtle-bounce' : ''}`}
                              style={{
                                backgroundColor:
                                  ruleColorStyle === 'dark_on_light'
                                    ? getWashBgColor(ruleColor)
                                    : ruleColor,
                                color:
                                  ruleColorStyle === 'dark_on_light'
                                    ? '#2B2C30'
                                    : getContrastingTextColor(ruleColor),
                              }}
                            >
                              @{def.tag}[{ruleKey ? `${ruleKey}=${ruleValue || 'val'}` : ruleValue || 'val'}]
                            </span>
                          </div>

                          {ruleError && (
                            <p className="text-xs text-[#D23B38] font-sans">{ruleError}</p>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#E5DFD5]">
                            <button
                              type="button"
                              onClick={() => setIsAddingRule(false)}
                              className="px-2.5 py-1 text-xs text-[#7E7F85] hover:text-[#2B2C30] hover:bg-[#EAE3D6] rounded transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveRule(def.tag)}
                              className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147] transition-colors cursor-pointer shadow-xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save Rule</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
            <div className="flex items-center gap-1 shrink-0 relative">
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

              {/* Custom Color Picker for New Tag */}
              <div className="relative">
                <button
                  ref={newTagColorButtonRef}
                  type="button"
                  onClick={() => setIsNewTagColorPickerOpen((prev) => !prev)}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${
                    isNewTagColorPickerOpen || !CANONICAL_COLOR_LIST.slice(0, 6).some((c) => c.solid.toLowerCase() === newTagColor.toLowerCase())
                      ? 'ring-2 ring-[#2B2C30] border-transparent'
                      : 'border-[#DDD6C8]'
                  }`}
                  style={{ backgroundColor: newTagColor }}
                  title={`Custom Color: ${newTagColor}`}
                >
                  <Pipette className="w-2.5 h-2.5 text-white mix-blend-difference" />
                </button>

                {isNewTagColorPickerOpen && (
                  <ColorPickerPopover
                    currentColor={newTagColor}
                    onSelectColor={(hex) => setNewTagColor(hex)}
                    onClose={() => setIsNewTagColorPickerOpen(false)}
                    triggerRef={newTagColorButtonRef}
                    portalContainer={dialogRef.current}
                  />
                )}
              </div>
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
