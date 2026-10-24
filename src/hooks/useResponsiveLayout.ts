import { useState, useEffect, useCallback } from 'react';

export type HorizonPanel = 'day' | 'week' | 'months' | 'reflections';

/**
 * Semantic layout tiers defining the multi-horizon presentation architecture.
 * - mobile: < 768px (Phone / Single Horizon Swipe Deck)
 * - compact: 768px - 1279px (Foldables / Tablets / Laptops / Split Grid)
 * - desktop: >= 1280px (Full Desktop / Continuous 3-Column Horizon Roll)
 */
export type LayoutTier = 'mobile' | 'compact' | 'desktop';

export interface ResponsiveLayoutState {
  isMobile: boolean; // < 768px (Phone)
  isCompact: boolean; // 768px - 1279px (Tablet / Laptop / Foldable)
  isDesktop: boolean; // >= 1280px (Full Desktop)
  layoutTier: LayoutTier;
  width: number;
  height: number;
  isKeyboardOpen: boolean;
  activePanel: HorizonPanel;
  setActivePanel: (panel: HorizonPanel) => void;
  monthsCompactView: 'stacked' | 'grid' | 'reflections';
  setMonthsCompactView: (view: 'stacked' | 'grid' | 'reflections') => void;
  radarCompactView: 'stacked' | 'grid' | 'reflections';
  setRadarCompactView: (view: 'stacked' | 'grid' | 'reflections') => void;
}

/**
 * Evaluates the current semantic layout tier based on viewport width.
 */
export function getLayoutTier(): LayoutTier {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1280) return 'compact';
  return 'desktop';
}

/**
 * Responsive layout hook built for high-performance fluid resizing.
 *
 * ARCHITECTURAL PRINCIPLE:
 * We decouple discrete layout tier transitions from continuous pixel-by-pixel resizing.
 * While dragging the window or folding a dual-screen device, CSS flexbox and grid handle
 * fluid scaling at 120 FPS on the compositor thread. React only re-renders when the
 * macro semantic tier ('mobile' | 'compact' | 'desktop') actually changes, avoiding
 * hundreds of unnecessary root App re-renders.
 */
export function useResponsiveLayout(): ResponsiveLayoutState {
  const [layoutTier, setLayoutTier] = useState<LayoutTier>(getLayoutTier);
  const [activePanel, setActivePanel] = useState<HorizonPanel>('day');
  const [radarCompactView, setRadarCompactView] = useState<'stacked' | 'grid' | 'reflections'>('stacked');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Discrete Layout Tier Listener with requestAnimationFrame dampening
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rAFId: number;

    const handleResize = () => {
      cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        const nextTier = getLayoutTier();
        setLayoutTier((prevTier) => {
          if (prevTier !== nextTier) {
            // When expanding to desktop, reset compact radar view to 'stacked'
            // so any subsequent resize down starts cleanly in Split mode
            if (nextTier === 'desktop') {
              setRadarCompactView('stacked');
            }
            return nextTier;
          }
          // Returning existing reference skips React re-render
          return prevTier;
        });
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rAFId);
    };
  }, []);

  // Detect virtual keyboard on mobile via visualViewport or active focus
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusChange = () => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      setIsKeyboardOpen(Boolean(isInput));
    };

    const handleVisualViewportResize = () => {
      if (!window.visualViewport) return;
      // If visualViewport height is substantially smaller than window.innerHeight, keyboard is visible
      const heightDiff = window.innerHeight - window.visualViewport.height;
      if (heightDiff > 160) {
        setIsKeyboardOpen(true);
      } else {
        const activeEl = document.activeElement;
        const isInput =
          activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          (activeEl instanceof HTMLElement && activeEl.isContentEditable);
        if (!isInput) {
          setIsKeyboardOpen(false);
        }
      }
    };

    document.addEventListener('focusin', handleFocusChange);
    document.addEventListener('focusout', handleFocusChange);
    window.visualViewport?.addEventListener('resize', handleVisualViewportResize);

    return () => {
      document.removeEventListener('focusin', handleFocusChange);
      document.removeEventListener('focusout', handleFocusChange);
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
    };
  }, []);

  const isMobile = layoutTier === 'mobile';
  const isCompact = layoutTier === 'compact';
  const isDesktop = layoutTier === 'desktop';

  const handleSetActivePanel = useCallback((panel: HorizonPanel) => {
    setActivePanel(panel);
  }, []);

  const handleSetRadarCompactView = useCallback((view: 'stacked' | 'grid' | 'reflections') => {
    setRadarCompactView(view);
  }, []);

  return {
    isMobile,
    isCompact,
    isDesktop,
    layoutTier,
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
    isKeyboardOpen,
    activePanel,
    setActivePanel: handleSetActivePanel,
    monthsCompactView: radarCompactView,
    setMonthsCompactView: handleSetRadarCompactView,
    radarCompactView,
    setRadarCompactView: handleSetRadarCompactView,
  };
}
