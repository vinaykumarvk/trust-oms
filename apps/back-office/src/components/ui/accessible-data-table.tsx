/**
 * Accessible Data Table -- Phase 10D (WCAG 2.1 AA Compliance)
 *
 * Wrapper around the base Table component that adds:
 *   - Column sorting with aria-sort indicators
 *   - Keyboard navigation (arrow keys between cells)
 *   - Row selection announcements via aria-live
 *   - Caption with table summary
 *   - Focus management following WAI-ARIA grid pattern
 *
 * Uses utilities from @/lib/accessibility.ts for announcements and
 * keyboard handling.
 */

import {
  useState,
  useRef,
  useCallback,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@ui/components/ui/table";
import { announce, tableAriaLabel } from "@/lib/accessibility";
import { cn } from "@ui/lib/utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = "ascending" | "descending" | "none";

export interface ColumnDef<T> {
  /** Unique key (must match a property name on T for sorting) */
  key: string;
  /** Display header label */
  header: string;
  /** Whether this column is sortable */
  sortable?: boolean;
  /** Custom cell renderer; receives the row data */
  cell?: (row: T) => ReactNode;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Additional className for the header cell */
  headerClassName?: string;
  /** Additional className for body cells */
  cellClassName?: string;
}

export interface AccessibleDataTableProps<T extends Record<string, unknown>> {
  /** Table caption (visible) describing the table */
  caption: string;
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Row data */
  data: T[];
  /** Unique key extractor for each row */
  rowKey: (row: T) => string | number;
  /** Current page (1-based) for aria-label */
  page?: number;
  /** Total pages for aria-label */
  totalPages?: number;
  /** Table name for aria-label */
  tableName?: string;
  /** Called when sort changes; parent controls the actual sorting */
  onSort?: (columnKey: string, direction: SortDirection) => void;
  /** Currently sorted column key */
  sortKey?: string;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Called when a row is selected (clicked or Enter) */
  onRowSelect?: (row: T, index: number) => void;
  /** Index of the currently selected row (controlled) */
  selectedIndex?: number;
  /** Additional className for the wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextSortDirection(current: SortDirection): SortDirection {
  switch (current) {
    case "none":
      return "ascending";
    case "ascending":
      return "descending";
    case "descending":
      return "none";
  }
}

function SortIcon({ direction }: { direction: SortDirection }) {
  switch (direction) {
    case "ascending":
      return <ArrowUp className="ml-1 h-3 w-3 inline" aria-hidden="true" />;
    case "descending":
      return <ArrowDown className="ml-1 h-3 w-3 inline" aria-hidden="true" />;
    default:
      return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" aria-hidden="true" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccessibleDataTable<T extends Record<string, unknown>>({
  caption,
  columns,
  data,
  rowKey,
  page = 1,
  totalPages = 1,
  tableName = "Data",
  onSort,
  sortKey,
  sortDirection = "none",
  onRowSelect,
  selectedIndex,
  className,
}: AccessibleDataTableProps<T>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const captionId = useId();
  const liveRegionId = useId();

  // Track focused cell for keyboard grid navigation: [rowIndex, colIndex]
  // rowIndex -1 = header row
  const [focusedCell, setFocusedCell] = useState<[number, number]>([-1, 0]);

  // Announce row selection to screen readers
  const announceSelection = useCallback(
    (row: T, index: number) => {
      const key = rowKey(row);
      announce(`Row ${index + 1} selected: ${String(key)}`, "polite");
    },
    [rowKey],
  );

  // Handle sort column click
  const handleSort = useCallback(
    (columnKey: string) => {
      if (!onSort) return;
      const current = columnKey === sortKey ? sortDirection : "none";
      const next = nextSortDirection(current);
      onSort(columnKey, next);

      const col = columns.find((c) => c.key === columnKey);
      if (col) {
        const dirLabel =
          next === "none" ? "unsorted" : `sorted ${next}`;
        announce(`${col.header} column ${dirLabel}`, "polite");
      }
    },
    [onSort, sortKey, sortDirection, columns],
  );

  // Handle row selection
  const handleRowSelect = useCallback(
    (row: T, index: number) => {
      onRowSelect?.(row, index);
      announceSelection(row, index);
    },
    [onRowSelect, announceSelection],
  );

  // Keyboard navigation following WAI-ARIA grid pattern
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableElement>) => {
      const [row, col] = focusedCell;
      const maxRow = data.length - 1;
      const maxCol = columns.length - 1;
      let nextRow = row;
      let nextCol = col;
      let handled = false;

      switch (e.key) {
        case "ArrowRight":
          nextCol = Math.min(col + 1, maxCol);
          handled = true;
          break;
        case "ArrowLeft":
          nextCol = Math.max(col - 1, 0);
          handled = true;
          break;
        case "ArrowDown":
          nextRow = Math.min(row + 1, maxRow);
          handled = true;
          break;
        case "ArrowUp":
          nextRow = Math.max(row - 1, -1);
          handled = true;
          break;
        case "Home":
          if (e.ctrlKey) {
            nextRow = -1;
            nextCol = 0;
          } else {
            nextCol = 0;
          }
          handled = true;
          break;
        case "End":
          if (e.ctrlKey) {
            nextRow = maxRow;
            nextCol = maxCol;
          } else {
            nextCol = maxCol;
          }
          handled = true;
          break;
        case "Enter":
        case " ":
          if (row >= 0 && row <= maxRow) {
            e.preventDefault();
            handleRowSelect(data[row], row);
          }
          return;
      }

      if (handled) {
        e.preventDefault();
        setFocusedCell([nextRow, nextCol]);

        // Focus the actual cell element
        const table = tableRef.current;
        if (table) {
          // +1 because row -1 maps to thead > tr (index 0 of all rows)
          const rowElements = table.querySelectorAll("tr");
          const trIndex = nextRow + 1; // 0 = header row, 1+ = body rows
          const tr = rowElements[trIndex];
          if (tr) {
            const cells = tr.querySelectorAll("th, td");
            const cell = cells[nextCol] as HTMLElement;
            cell?.focus();
          }
        }
      }
    },
    [focusedCell, data, columns, handleRowSelect],
  );

  const ariaLabel = tableAriaLabel(tableName, data.length, page, totalPages);

  return (
    <div className={cn("relative", className)}>
      {/* Live region for announcements */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <Table
        ref={tableRef}
        role="grid"
        aria-label={ariaLabel}
        aria-describedby={captionId}
        onKeyDown={handleKeyDown}
      >
        <TableCaption id={captionId}>{caption}</TableCaption>
        <TableHeader>
          <TableRow role="row">
            {columns.map((col, colIndex) => {
              const isSorted = sortKey === col.key;
              const currentDirection = isSorted ? sortDirection : "none";
              const isFocused = focusedCell[0] === -1 && focusedCell[1] === colIndex;

              return (
                <TableHead
                  key={col.key}
                  role="columnheader"
                  aria-sort={col.sortable ? currentDirection : undefined}
                  tabIndex={isFocused ? 0 : -1}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.sortable && "cursor-pointer select-none hover:bg-muted/50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    col.headerClassName,
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  onKeyDown={
                    col.sortable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSort(col.key);
                          }
                        }
                      : undefined
                  }
                  onFocus={() => setFocusedCell([-1, colIndex])}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && <SortIcon direction={currentDirection} />}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                No data available
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, rowIndex) => {
              const isSelected = selectedIndex === rowIndex;
              return (
                <TableRow
                  key={rowKey(row)}
                  role="row"
                  aria-selected={isSelected || undefined}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(
                    onRowSelect && "cursor-pointer",
                    isSelected && "bg-muted",
                  )}
                  onClick={() => onRowSelect && handleRowSelect(row, rowIndex)}
                >
                  {columns.map((col, colIndex) => {
                    const isFocused =
                      focusedCell[0] === rowIndex && focusedCell[1] === colIndex;
                    const cellValue = col.cell
                      ? col.cell(row)
                      : (row[col.key] as ReactNode);

                    return (
                      <TableCell
                        key={col.key}
                        role="gridcell"
                        tabIndex={isFocused ? 0 : -1}
                        className={cn(
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          col.cellClassName,
                        )}
                        onFocus={() => setFocusedCell([rowIndex, colIndex])}
                      >
                        {cellValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
