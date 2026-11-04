import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  getTagDefinitions,
  type UserTagDefinition,
} from '../services/tagService';
import { CORE_TAG_PROTOTYPES } from '../utils/tagPrototypes';
import type { ParsedTagToken } from '../utils/tagParser';
import {
  resolveTagStyle,
  type ResolvedTagStyle,
} from '../utils/tagStyleResolver';
import type { BadgeTheme } from '../utils/annotationUtils';

interface TagDefinitionsContextValue {
  definitions: Record<string, UserTagDefinition>;
  isLoading: boolean;
  refreshDefinitions: () => Promise<void>;
  getStyleForToken: (
    tag: string,
    token?: ParsedTagToken | null,
    isResolved?: boolean,
    badgeTheme?: BadgeTheme
  ) => ResolvedTagStyle;
}

const defaultDefinitions: Record<string, UserTagDefinition> = {};
for (const [key, proto] of Object.entries(CORE_TAG_PROTOTYPES)) {
  defaultDefinitions[key.toLowerCase()] = {
    tag: proto.tag,
    color: proto.color,
    notable: proto.notable ? 1 : 0,
    gutterPriority: proto.gutterPriority,
    isCore: proto.isCore ? 1 : 0,
    defaultStatus: proto.defaultStatus,
    styleRules: proto.styleRules ? [...proto.styleRules] : [],
    baseStyle: proto.baseStyle ? { ...proto.baseStyle } : undefined,
  };
}

const TagDefinitionsContext = createContext<TagDefinitionsContextValue>({
  definitions: defaultDefinitions,
  isLoading: false,
  refreshDefinitions: async () => {},
  getStyleForToken: (tag, token, isResolved, badgeTheme) =>
    resolveTagStyle(tag, token, null, isResolved, badgeTheme),
});

export const TagDefinitionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [definitions, setDefinitions] = useState<Record<string, UserTagDefinition>>(defaultDefinitions);
  const [isLoading, setIsLoading] = useState(false);

  const refreshDefinitions = useCallback(async () => {
    setIsLoading(true);
    try {
      const defs = await getTagDefinitions();
      setDefinitions(defs);
    } catch (err) {
      console.warn('[TagDefinitionsContext] Failed to load tag definitions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDefinitions();
  }, [refreshDefinitions]);

  const getStyleForToken = useCallback(
    (
      tag: string,
      token?: ParsedTagToken | null,
      isResolved = false,
      badgeTheme?: BadgeTheme
    ): ResolvedTagStyle => {
      const cleanTag = (tag || '').toLowerCase().trim();
      const def = definitions[cleanTag] || CORE_TAG_PROTOTYPES[cleanTag];
      return resolveTagStyle(cleanTag, token, def, isResolved, badgeTheme);
    },
    [definitions]
  );

  const value = useMemo(
    () => ({
      definitions,
      isLoading,
      refreshDefinitions,
      getStyleForToken,
    }),
    [definitions, isLoading, refreshDefinitions, getStyleForToken]
  );

  return (
    <TagDefinitionsContext.Provider value={value}>
      {children}
    </TagDefinitionsContext.Provider>
  );
};

export const useTagDefinitions = (): TagDefinitionsContextValue => {
  return useContext(TagDefinitionsContext);
};
