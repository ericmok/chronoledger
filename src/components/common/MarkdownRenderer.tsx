import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { parseMarkdown, type Token } from '../../utils/markdownUtils';
import {
  parseNoteContent,
  type ParsedAnnotation,
  type BadgeTheme,
  DEFAULT_BADGE_THEME,
} from '../../utils/annotationUtils';

export interface MarkdownRendererProps {
  content: string;
  isStruck?: boolean;
  density?: 'comfortable' | 'compact';
  badgeTheme?: BadgeTheme;
  onToggleTask?: (taskIndex: number) => void;
  renderAnnotationBadge?: (
    badge: ParsedAnnotation,
    key: string | number,
    isDeleted?: boolean,
    isAdded?: boolean
  ) => React.ReactNode;
  /**
   * Leading anchor badge element (e.g. @todo, @event, @important chip).
   *
   * Architectural Note:
   * To preserve ChronoLedger's signature "Fused Leading Badge Anchor" layout
   * (documented in ANNOTATIONS_AND_DIFFS.md), the anchor badge must share the
   * exact same inline line-formatting context as Line 1 of the prose.
   *
   * By passing leadingAnchor into MarkdownRenderer, we inject the badge directly
   * as the first child of the first block (index === 0), allowing Line 1 of the
   * note prose to continue immediately after the chip at x ≈ 60px, while wrapped
   * lines 2+ indent cleanly to the container's pl-5 baseline at x = 20px.
   */
  leadingAnchor?: React.ReactNode;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isStruck = false,
  density = 'comfortable',
  badgeTheme = DEFAULT_BADGE_THEME,
  onToggleTask,
  renderAnnotationBadge,
  leadingAnchor,
  className = '',
}) => {
  const isComfortable = density === 'comfortable';

  // Parse markdown into AST tokens
  const { tokens } = useMemo(() => parseMarkdown(content), [content]);

  // Track task index across the whole note
  let taskIndexCounter = 0;

  /**
   * Renders inline text, handling semantic annotations (@todo, @important, \@tag, etc.)
   */
  const renderTextWithAnnotations = (text: string, keyPrefix: string) => {
    const { segments } = parseNoteContent(text, isStruck, badgeTheme);

    return segments.map((seg, idx) => {
      const key = `${keyPrefix}-${idx}`;

      if (seg.type === 'badge' && seg.annotation) {
        if (renderAnnotationBadge) {
          return renderAnnotationBadge(seg.annotation, key);
        }

        // Fallback default badge pill if not passed
        const isResolved = Boolean(isStruck || seg.annotation.isResolved);
        const bgColor = isResolved ? seg.annotation.resolvedBgColor : seg.annotation.bgColor;
        const textColor = isResolved ? seg.annotation.resolvedTextColor : seg.annotation.textColor;

        return (
          <span
            key={key}
            className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-[2px] rounded text-[11px] font-sans font-semibold align-baseline leading-none select-none"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {seg.annotation.tag}
          </span>
        );
      }

      if (seg.type === 'text') {
        return <span key={key}>{seg.text}</span>;
      }

      return null;
    });
  };

  /**
   * Recursively renders inline markdown tokens
   */
  const renderInlineToken = (token: Token, key: string): React.ReactNode => {
    switch (token.type) {
      case 'text':
        return <React.Fragment key={key}>{renderTextWithAnnotations(token.text, key)}</React.Fragment>;

      case 'strong':
        return (
          <strong key={key} className="font-semibold text-[#1C1D20]">
            {(token as any).tokens
              ? (token as any).tokens.map((child: Token, cIdx: number) =>
                  renderInlineToken(child, `${key}-s-${cIdx}`)
                )
              : token.text}
          </strong>
        );

      case 'em':
        return (
          <em key={key} className="italic font-serif text-[#3E3F45]">
            {(token as any).tokens
              ? (token as any).tokens.map((child: Token, cIdx: number) =>
                  renderInlineToken(child, `${key}-em-${cIdx}`)
                )
              : token.text}
          </em>
        );

      case 'codespan':
        return (
          <code
            key={key}
            className="font-mono text-[11px] bg-[#EAE3D6]/70 text-[#2B2C30] px-1 py-0.5 rounded border border-[#DDD6C8]/60 align-baseline"
          >
            {token.text}
          </code>
        );

      case 'del': {
        const raw = token.raw || '';
        // If it's a resolved annotation tag (e.g. ~~@todo~~), parse as resolved badge
        if (raw.startsWith('~~@') && renderAnnotationBadge) {
          const { annotations } = parseNoteContent(raw, true, badgeTheme);
          if (annotations.length > 0) {
            return renderAnnotationBadge(annotations[0], key);
          }
        }

        return (
          <del key={key} className="line-through decoration-[#A19D94] text-[#8E8F95]">
            {(token as any).tokens
              ? (token as any).tokens.map((child: Token, cIdx: number) =>
                  renderInlineToken(child, `${key}-del-${cIdx}`)
                )
              : token.text}
          </del>
        );
      }

      case 'link':
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline underline-offset-2 decoration-[#83C5BE] text-[#1D4ED8] hover:text-[#1E40AF] cursor-pointer"
            title={token.href}
          >
            {(token as any).tokens
              ? (token as any).tokens.map((child: Token, cIdx: number) =>
                  renderInlineToken(child, `${key}-l-${cIdx}`)
                )
              : token.text}
          </a>
        );

      case 'escape':
        return <React.Fragment key={key}>{renderTextWithAnnotations(token.text, key)}</React.Fragment>;

      case 'br':
        return <br key={key} />;

      default:
        return 'text' in token ? renderTextWithAnnotations((token as any).text, key) : null;
    }
  };

  /**
   * Renders top-level block tokens.
   *
   * Fused Anchor System:
   * To prevent block-level layout line breaks between a leading annotation badge
   * and the first line of prose, leadingAnchor is injected into the very first block
   * (index === 0). The first paragraph renders as an inline <span> so that Line 1
   * flows continuously:
   *   Line 1: [• @todo] Review PR draft and verify tests
   *   Line 2: before deploying to staging environment.
   */
  const renderBlockToken = (token: Token, index: number): React.ReactNode => {
    const key = `block-${index}`;
    // Attach the leading anchor badge to the first block only
    const anchor = index === 0 ? leadingAnchor : null;

    switch (token.type) {
      case 'heading': {
        const depth = token.depth;
        const children = (token as any).tokens
          ? (token as any).tokens.map((child: Token, cIdx: number) =>
              renderInlineToken(child, `${key}-h-${cIdx}`)
            )
          : renderTextWithAnnotations(token.text, key);

        if (depth === 1) {
          return (
            <h1
              key={key}
              className="font-serif text-[15px] font-bold text-[#1C1D20] mt-1 mb-1 pb-0.5 border-b border-[#E5DFD5]/70 leading-snug"
            >
              {anchor}
              {children}
            </h1>
          );
        }
        if (depth === 2) {
          return (
            <h2
              key={key}
              className="font-serif text-[13.5px] font-semibold text-[#2B2C30] mt-1 mb-0.5 leading-snug"
            >
              {anchor}
              {children}
            </h2>
          );
        }
        return (
          <h3
            key={key}
            className="font-serif text-[12.5px] font-medium text-[#404147] mt-0.5 mb-0.5 leading-snug"
          >
            {anchor}
            {children}
          </h3>
        );
      }

      case 'list': {
        const isOrdered = token.ordered;
        const items = (token as any).items || [];

        const renderedItems = items.map((item: any, itemIdx: number) => {
          const itemKey = `${key}-item-${itemIdx}`;
          // If the list is the very first block, attach leadingAnchor before the first item
          const itemAnchor = index === 0 && itemIdx === 0 ? anchor : null;

          // Task Checklist item
          if (item.task) {
            const currentTaskIdx = taskIndexCounter++;
            const isChecked = Boolean(item.checked);

            return (
              <li
                key={itemKey}
                className="flex items-start gap-1.5 list-none my-0.5 leading-snug"
              >
                {itemAnchor}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTask?.(currentTaskIdx);
                  }}
                  className={`mt-[2.5px] w-3.5 h-3.5 rounded-[3px] flex items-center justify-center shrink-0 transition-colors cursor-pointer border ${
                    isChecked
                      ? 'bg-[#2B2C30] border-[#2B2C30] text-[#FAF8F5]'
                      : 'bg-white/80 border-[#A19D94] hover:border-[#2B2C30] hover:bg-white text-transparent'
                  }`}
                  title={isChecked ? 'Mark as incomplete' : 'Mark as complete'}
                >
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </button>
                <div
                  className={`flex-1 min-w-0 ${
                    isChecked ? 'line-through text-[#8E8F95] opacity-75 decoration-[#A19D94]' : ''
                  }`}
                >
                  {(item as any).tokens
                    ? (item as any).tokens.map((child: Token, cIdx: number) => {
                        // Skip rendering the raw checkbox token since we rendered the button above
                        if (child.type === 'checkbox') return null;
                        return renderInlineToken(child, `${itemKey}-c-${cIdx}`);
                      })
                    : renderTextWithAnnotations(item.text, itemKey)}
                </div>
              </li>
            );
          }

          // Standard list item
          return (
            <li key={itemKey} className="leading-relaxed">
              {itemAnchor}
              {(item as any).tokens
                ? (item as any).tokens.map((child: Token, cIdx: number) =>
                    renderInlineToken(child, `${itemKey}-c-${cIdx}`)
                  )
                : renderTextWithAnnotations(item.text, itemKey)}
            </li>
          );
        });

        const hasTasks = items.some((it: any) => it.task);
        if (hasTasks) {
          return (
            <ul key={key} className="space-y-0.5 my-1 pl-0 list-none">
              {renderedItems}
            </ul>
          );
        }

        if (isOrdered) {
          return (
            <ol key={key} className="list-decimal pl-4 space-y-0.5 my-1">
              {renderedItems}
            </ol>
          );
        }

        return (
          <ul key={key} className="list-disc pl-4 space-y-0.5 my-1">
            {renderedItems}
          </ul>
        );
      }

      case 'blockquote': {
        const children = (token as any).tokens
          ? (token as any).tokens.map((child: Token, cIdx: number) =>
              renderBlockToken(child, cIdx)
            )
          : renderTextWithAnnotations(token.text, key);

        return (
          <blockquote
            key={key}
            className="border-l-2 border-[#D5CDC0] pl-2.5 my-1 text-[#55565B] italic font-serif leading-relaxed"
          >
            {anchor}
            {children}
          </blockquote>
        );
      }

      case 'code':
        return (
          <React.Fragment key={key}>
            {anchor}
            <pre
              className="bg-[#F2EDE4]/70 border border-[#DDD6C8] rounded-md p-2 my-1 text-[11px] font-mono text-[#2B2C30] overflow-x-auto selection:bg-[#EAE3D6] leading-snug"
            >
              <code>{token.text}</code>
            </pre>
          </React.Fragment>
        );

      case 'hr':
        return <hr key={key} className="border-t border-[#E5DFD5] my-1.5" />;

      case 'paragraph': {
        const children = (token as any).tokens
          ? (token as any).tokens.map((child: Token, cIdx: number) =>
              renderInlineToken(child, `${key}-p-${cIdx}`)
            )
          : renderTextWithAnnotations(token.text, key);

        // For the first paragraph (index === 0), render as an inline span so it sits
        // on the exact same line as leadingAnchor without triggering a block-level break.
        if (index === 0) {
          return (
            <span key={key} className="inline leading-relaxed">
              {anchor}
              {children}
            </span>
          );
        }

        // Subsequent paragraphs (index > 0) render as block elements with comfortable spacing.
        return (
          <span key={key} className="block mt-1.5 leading-relaxed">
            {children}
          </span>
        );
      }

      case 'space':
        return <div key={key} className="h-0.5" />;

      default:
        if ('text' in token) {
          return (
            <span
              key={key}
              className={index === 0 ? 'inline leading-relaxed' : 'block mt-1.5 leading-relaxed'}
            >
              {anchor}
              {renderTextWithAnnotations((token as any).text, key)}
            </span>
          );
        }
        return null;
    }
  };

  return (
    <div
      className={`markdown-content font-sans break-words ${
        isComfortable ? 'text-sm' : 'text-xs'
      } ${className}`}
    >
      {/* If note has no tokens (e.g. note is only an anchor tag like '@todo'), render anchor alone */}
      {tokens.length === 0 && leadingAnchor ? leadingAnchor : null}
      {tokens.map((token, idx) => renderBlockToken(token, idx))}
    </div>
  );
};
