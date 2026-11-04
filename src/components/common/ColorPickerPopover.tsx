import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Check, X } from 'lucide-react';
import { CANONICAL_COLOR_LIST } from '../../utils/canonicalColors';
import {
  parseColorToHex,
  hexToHsv,
  hsvToHex,
} from '../../utils/annotationUtils';

interface ColorPickerPopoverProps {
  currentColor: string;
  onSelectColor: (hex: string) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  portalContainer?: HTMLElement | null;
  title?: string;
  className?: string;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  currentColor,
  onSelectColor,
  onClose,
  triggerRef,
  portalContainer,
  title = 'Stationery Swatches',
  className = '',
}) => {
  // Parse initial color into HSV (0..360, 0..1, 0..1)
  const initialHex = parseColorToHex(currentColor) || '#3B82F6';
  const initialHsv = hexToHsv(initialHex);

  const [hue, setHue] = useState<number>(initialHsv.h);
  const [sat, setSat] = useState<number>(initialHsv.s);
  const [val, setVal] = useState<number>(initialHsv.v);
  const [customInput, setCustomInput] = useState<string>(initialHex);
  const [inputError, setInputError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const hueTrackRef = useRef<HTMLDivElement | null>(null);

  // Compute smart floating coordinates relative to viewport
  const getCoords = () => {
    if (!triggerRef?.current || typeof window === 'undefined') return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 268;
    const popoverHeight = 390;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    // If not enough room below and more room above, flip upwards
    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      top = Math.max(12, rect.top - popoverHeight - 8);
    } else {
      top = Math.min(viewportHeight - popoverHeight - 12, rect.bottom + 8);
    }

    let left = rect.left;
    if (left + popoverWidth > viewportWidth - 16) {
      left = viewportWidth - popoverWidth - 16;
    }
    left = Math.max(16, left);

    return { top, left };
  };

  const [coords, setCoords] = useState<{ top: number; left: number } | null>(getCoords);

  // Sync coords on trigger position changes, resize, or scroll
  useLayoutEffect(() => {
    const updatePosition = () => {
      const next = getCoords();
      if (next) setCoords(next);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [triggerRef]);

  // Sync when currentColor changes externally
  useEffect(() => {
    const parsed = parseColorToHex(currentColor);
    if (parsed) {
      const hsv = hexToHsv(parsed);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
      setCustomInput(parsed);
    }
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

  // 2D Saturation / Value Drag Handler
  const handleSvPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!svAreaRef.current) return;
    const rect = svAreaRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const newSat = x / rect.width;
    const newVal = 1 - y / rect.height;

    setSat(newSat);
    setVal(newVal);

    const newHex = hsvToHex(hue, newSat, newVal);
    setCustomInput(newHex);
    setInputError(null);
    onSelectColor(newHex);
  };

  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleSvPointer(e);
  };

  const handleSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) {
      handleSvPointer(e);
    }
  };

  // 1D Hue Slider Drag Handler
  const handleHuePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hueTrackRef.current) return;
    const rect = hueTrackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const newHue = Math.round((x / rect.width) * 360) % 360;

    setHue(newHue);
    const newHex = hsvToHex(newHue, sat, val);
    setCustomInput(newHex);
    setInputError(null);
    onSelectColor(newHex);
  };

  const handleHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleHuePointer(e);
  };

  const handleHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) {
      handleHuePointer(e);
    }
  };

  // Preset Swatch Click
  const handleSelectSwatch = (solid: string) => {
    const hex = parseColorToHex(solid);
    if (!hex) return;
    const hsv = hexToHsv(hex);
    setHue(hsv.h);
    setSat(hsv.s);
    setVal(hsv.v);
    setCustomInput(hex);
    setInputError(null);
    onSelectColor(hex);
  };

  // Apply Custom Text Input (Hex or HSL)
  const handleApplyCustomColor = () => {
    const parsed = parseColorToHex(customInput);
    if (parsed) {
      const hsv = hexToHsv(parsed);
      setHue(hsv.h);
      setSat(hsv.s);
      setVal(hsv.v);
      setCustomInput(parsed);
      setInputError(null);
      onSelectColor(parsed);
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

  // Optional Eyedropper API (Chromium / Modern Desktop)
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const handleScreenEyedropper = async () => {
    if (!hasEyeDropper) return;
    try {
      const dropper = new (window as any).EyeDropper();
      const res = await dropper.open();
      if (res?.sRGBHex) {
        const hex = res.sRGBHex.toUpperCase();
        const hsv = hexToHsv(hex);
        setHue(hsv.h);
        setSat(hsv.s);
        setVal(hsv.v);
        setCustomInput(hex);
        setInputError(null);
        onSelectColor(hex);
      }
    } catch {
      // User cancelled with Escape
    }
  };

  const currentComputedHex = hsvToHex(hue, sat, val);

  const popoverContent = (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      style={
        coords
          ? {
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
            }
          : undefined
      }
      className={`p-3 bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-2xl w-67 space-y-2.5 animate-in zoom-in-95 duration-100 select-none ${className}`}
    >
      {/* 1. Header & Close Button */}
      <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-1.5">
        <span className="text-[10px] font-mono font-semibold uppercase text-[#7E7F85]">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[#A19D94] hover:text-[#2B2C30] p-0.5 rounded transition-colors cursor-pointer"
          title="Close color picker"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Interactive 2D Saturation-Value Box */}
      <div>
        <div
          ref={svAreaRef}
          onPointerDown={handleSvPointerDown}
          onPointerMove={handleSvPointerMove}
          className="relative w-full h-28 rounded-lg cursor-crosshair overflow-hidden shadow-inner border border-black/10 touch-none"
          style={{
            backgroundColor: `hsl(${hue}, 100%, 50%)`,
          }}
          title="Click or drag to adjust saturation and brightness"
        >
          {/* Horizontal white-to-transparent gradient (Saturation) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, #FFFFFF, transparent)',
            }}
          />
          {/* Vertical transparent-to-black gradient (Value) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to top, #000000, transparent)',
            }}
          />
          {/* Draggable Indicator Thumb */}
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform"
            style={{
              left: `${sat * 100}%`,
              top: `${(1 - val) * 100}%`,
              backgroundColor: currentComputedHex,
            }}
          />
        </div>
      </div>

      {/* 3. Interactive Hue Rainbow Slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono uppercase text-[#7E7F85]">Hue</span>
          <span className="text-[9px] font-mono text-[#7E7F85]">{hue}°</span>
        </div>
        <div
          ref={hueTrackRef}
          onPointerDown={handleHuePointerDown}
          onPointerMove={handleHuePointerMove}
          className="relative w-full h-3.5 rounded-full cursor-pointer shadow-inner border border-black/10 touch-none"
          style={{
            background:
              'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
          }}
          title="Click or drag to shift hue"
        >
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white bg-white shadow-md pointer-events-none transition-transform"
            style={{
              left: `${(hue / 360) * 100}%`,
              backgroundColor: `hsl(${hue}, 100%, 50%)`,
            }}
          />
        </div>
      </div>

      {/* 4. Curated Stationery Presets */}
      <div className="pt-1.5 border-t border-[#E5DFD5]">
        <div className="text-[9px] font-mono font-semibold uppercase text-[#7E7F85] mb-1">
          Presets
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {CANONICAL_COLOR_LIST.map((c) => {
            const isSelected = currentComputedHex.toLowerCase() === c.solid.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectSwatch(c.solid)}
                className={`w-5.5 h-5.5 rounded-full border border-black/10 transition-transform cursor-pointer relative flex items-center justify-center ${
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

      {/* 5. Hex / HSL Input & Eyedropper */}
      <div className="pt-1.5 border-t border-[#E5DFD5]">
        <div className="flex items-center gap-1.5">
          {hasEyeDropper && (
            <button
              type="button"
              onClick={handleScreenEyedropper}
              className="p-1 rounded border border-[#DDD6C8] bg-white hover:border-[#2B2C30] text-[#7E7F85] hover:text-[#2B2C30] transition-colors cursor-pointer shrink-0"
              title="Pick color from screen"
            >
              <Pipette className="w-3.5 h-3.5" />
            </button>
          )}

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

          <button
            type="button"
            onClick={handleApplyCustomColor}
            className="px-2 py-1 text-xs font-medium rounded bg-[#F2EDE4] text-[#2B2C30] hover:bg-[#EAE3D6] border border-[#DDD6C8] transition-colors cursor-pointer shrink-0"
            title="Apply text color"
          >
            Apply
          </button>
        </div>

        {inputError && (
          <p className="text-[10px] text-[#D23B38] font-sans mt-1 leading-tight">{inputError}</p>
        )}
      </div>

      {/* 6. Footer: Live Preview & Done Button */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E5DFD5]">
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border border-black/15 shadow-xs shrink-0"
            style={{ backgroundColor: currentComputedHex }}
          />
          <span className="text-xs font-mono font-semibold text-[#2B2C30]">
            {currentComputedHex}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-[#2B2C30] text-[#FAF8F5] hover:bg-[#404147] transition-colors cursor-pointer shadow-xs"
        >
          Done
        </button>
      </div>
    </div>
  );

  // Portal into dialog or body to escape overflow clipping
  const targetContainer = portalContainer || (typeof document !== 'undefined' ? document.body : null);
  if (targetContainer) {
    return createPortal(popoverContent, targetContainer);
  }

  return popoverContent;
};
