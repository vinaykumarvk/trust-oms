/**
 * WCAG Accessibility Utilities
 *
 * Provides helper functions for WCAG 2.1 AA compliance:
 * - Focus management
 * - Keyboard navigation
 * - ARIA label generation
 * - Color contrast validation
 * - Screen reader announcements
 */

import type React from "react";

/** Focus trap for modal dialogs */
export function createFocusTrap(containerRef: React.RefObject<HTMLElement>) {
  return {
    activate() {
      const container = containerRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      container.addEventListener("keydown", handleKeyDown);
      first.focus();

      return () => container.removeEventListener("keydown", handleKeyDown);
    },
  };
}

/** Generate ARIA label for data table */
export function tableAriaLabel(
  tableName: string,
  rowCount: number,
  page: number,
  totalPages: number,
): string {
  return `${tableName} table, showing ${rowCount} rows, page ${page} of ${totalPages}`;
}

/** Generate ARIA label for status badge */
export function statusAriaLabel(entity: string, status: string): string {
  return `${entity} status: ${status}`;
}

/** Keyboard navigation handler for list items */
export function handleListKeyDown(
  e: React.KeyboardEvent,
  currentIndex: number,
  totalItems: number,
  onSelect: (index: number) => void,
) {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      onSelect(Math.min(currentIndex + 1, totalItems - 1));
      break;
    case "ArrowUp":
      e.preventDefault();
      onSelect(Math.max(currentIndex - 1, 0));
      break;
    case "Home":
      e.preventDefault();
      onSelect(0);
      break;
    case "End":
      e.preventDefault();
      onSelect(totalItems - 1);
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      onSelect(currentIndex);
      break;
  }
}

/** Screen reader live region announcement */
export function announce(
  message: string,
  priority: "polite" | "assertive" = "polite",
) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", priority);
  el.setAttribute("aria-atomic", "true");
  el.className = "sr-only";
  el.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/** Check if color contrast meets WCAG AA (4.5:1 for normal text) */
export function meetsContrastRatio(
  foreground: string,
  background: string,
): boolean {
  const getLuminance = (hex: string): number => {
    const rgb = hex
      .replace("#", "")
      .match(/.{2}/g)
      ?.map((c) => {
        const val = parseInt(c, 16) / 255;
        return val <= 0.03928
          ? val / 12.92
          : Math.pow((val + 0.055) / 1.055, 2.4);
      });
    if (!rgb || rgb.length < 3) return 0;
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const ratio =
    (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio >= 4.5;
}

/** Skip to main content link helper */
export const SKIP_NAV_ID = "main-content";
export function SkipNavTarget() {
  return null; // Use: <div id={SKIP_NAV_ID} tabIndex={-1} />
}
