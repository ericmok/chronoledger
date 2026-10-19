import { useState, useEffect, useCallback } from 'react';

export type HorizonPanel = 'day' | 'week' | 'months' | 'reflections';

export interface ResponsiveLayoutState {
  isMobile: boolean; // < 768px (Phone)
  isCompact: boolean; // 768px - 1279px (Tablet / Laptop)
  isDesktop: boolean; // >= 1280px (Full Desktop)
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

export function useResponsiveLayout(): ResponsiveLayoutState {
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 1440, height: 900 };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  });

  const [activePanel, setActivePanel] = useState<HorizonPanel>('day');
  const [radarCompactView, setRadarCompactView] = useState<'stacked' | 'grid' | 'reflections'>('stacked');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Resize listener with requestAnimationFrame for performance
  useEffect(() => {
    let rAFId: number;

    const handleResize = () => {
      cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
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

  const isMobile = dimensions.width < 768;
  const isCompact = dimensions.width >= 768 && dimensions.width < 1280;
  const isDesktop = dimensions.width >= 1280;

  // Reset compact view to 'stacked' when expanding to desktop so resizing down starts in Split mode
  useEffect(() => {
    if (isDesktop && radarCompactView !== 'stacked') {
      setRadarCompactView('stacked');
    }
  }, [isDesktop, radarCompactView]);

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
    width: dimensions.width,
    height: dimensions.height,
    isKeyboardOpen,
    activePanel,
    setActivePanel: handleSetActivePanel,
    monthsCompactView: radarCompactView,
    setMonthsCompactView: handleSetRadarCompactView,
    radarCompactView,
    setRadarCompactView: handleSetRadarCompactView,
  };
}
