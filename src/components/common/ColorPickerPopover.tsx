import React, { useState, useRef, useEffect } from 'react';
import { Pipette, Check, X } from 'lucide-react';
import { CANONICAL_COLOR_LIST } from '../../utils/canonicalColors';
import { parseColorToHex } from '../../utils/annotationUtils';

interface ColorPickerPopoverProps {
  currentColor: string;
  onSelectColor: (hex: string) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  title?: string;
  className?: string;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  currentColor,
  onSelectColor,
  onClose,
  triggerRef,
  title = 'Stationery Swatches',
  className = '',
}) => {
  const [customInput, setCustomInput] = useState(currentColor);
  const [inputError, setInputError] = useState<string | null>(null);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Sync customInput when currentColor changes
  useEffect(() => {
    setCustomInput(currentColor);
  }, [currentColor]);

  // Click outside listener
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (triggerRef?.current && triggerRef.current.contains(e.target as Node)) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, triggerRef]);

  const parsedCustomHex = parseColorToHex(customInput);

  const handleApplyCustomColor = () => {
    if (parsedCustomHex) {
      onSelectColor(parsedCustomHex);
      setInputError(null);
    } else {
      setInputError('Invalid Hex or HSL (e.g. #3B82F6, hsl(210, 80%, 60%))');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyCustomColor();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value.toUpperCase();
    setCustomInput(hex);
    onSelectColor(hex);
  };

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className={`absolute z-30 p-3 bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-xl w-64 space-y-3 animate-in zoom-in-95 duration-100 ${className}`}
    >
      {/* 1. Curated Stationery Presets */}
      <div>
        <div className="text-[10px] font-mono font-semibold uppercase text-[#7E7F85] mb-1.5 flex items-center justify-between">
          <span>{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#A19D94] hover:text-[#2B2C30] p-0.5 rounded transition-colors cursor-pointer"
            title="Close color picker"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {CANONICAL_COLOR_LIST.map((c) => {
            const isSelected = currentColor.toLowerCase() === c.solid.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectColor(c.solid);
                  setCustomInput(c.solid);
                  setInputError(null);
                }}
                className={`w-6 h-6 rounded-full border border-black/10 transition-transform cursor-pointer relative flex items-center justify-center ${
                  isSelected ? 'scale-115 ring-2 ring-[#2B2C30]' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.solid }}
                title={`${c.label}: ${c.description}`}
              >
                {isSelected && <Check className="w-3 h-3 text-white drop-shadow-xs" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Custom Color: Hex / HSL Input & Native Wheel */}
      <div className="pt-2 border-t border-[#E5DFD5]">
        <div className="text-[10px] font-mono font-semibold uppercase text-[#7E7F85] mb-1.5 flex items-center justify-between">
          <span>Custom Hex / HSL</span>
          {parsedCustomHex && (
            <span className="font-mono text-[9px] text-[#2B2C30]">{parsedCustomHex}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Native Color Picker / Eyedropper Button */}
          <button
            type="button"
            onClick={() => nativeInputRef.current?.click()}
            className="w-7 h-7 rounded-lg border border-[#DDD6C8] flex items-center justify-center shrink-0 cursor-pointer hover:border-[#2B2C30] transition-colors relative"
            style={{
              backgroundColor: parsedCustomHex || currentColor,
            }}
            title="Open native color wheel & eyedropper"
          >
            <Pipette className="w-3.5 h-3.5 text-white mix-blend-difference" />
            <input
              ref={nativeInputRef}
              type="color"
              value={parsedCustomHex || (currentColor.startsWith('#') ? currentColor : '#6F7880')}
              onChange={handleNativeColorChange}
              className="sr-only"
            />
          </button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setInputError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="#3B82F6, hsl(...)"
              className="w-full px-2 py-1 text-xs font-mono bg-white border border-[#DDD6C8] rounded focus:outline-none focus:border-[#2B2C30] text-[#2B2C30]"
            />
          </div>

          {/* Apply Button */}
          <button
            type="button"
            onClick={handleApplyCustomColor}
            disabled={!parsedCustomHex}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer shrink-0 ${
              parsedCustomHex
                ? 'bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147]'
                : 'bg-[#EAE3D6] text-[#A19D94] cursor-not-allowed'
            }`}
            title="Apply custom color"
          >
            Apply
          </button>
        </div>

        {inputError && (
          <p className="text-[10px] text-[#D23B38] font-sans mt-1 leading-tight">{inputError}</p>
        )}
      </div>
    </div>
  );
};
