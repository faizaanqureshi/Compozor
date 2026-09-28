"use client";

import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentCategoryId, DocumentCategoryOption } from "@/lib/document-categories";

// Multi-select category filter for a client's Files card. An empty
// selection is "All docs"; ticking a category narrows to it, and clearing
// the last one (or picking "All docs") returns to everything. The menu
// stays open while toggling so several categories can be picked at once.
export function DocumentCategoryFilter({
  options,
  selected,
  onChange,
}: {
  options: DocumentCategoryOption[];
  selected: ReadonlySet<DocumentCategoryId>;
  onChange: (next: Set<DocumentCategoryId>) => void;
}) {
  const allSelected = selected.size === 0;

  const toggle = (id: DocumentCategoryId, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={allSelected ? "Filter files" : `Filter files, ${selected.size} selected`}
          />
        }
      >
        <ListFilter />
        Filter
        {!allSelected && <span className="text-muted-foreground tabular-nums">· {selected.size}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuCheckboxItem
          indicator="checkbox"
          checked={allSelected}
          onCheckedChange={() => onChange(new Set())}
        >
          All docs
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            indicator="checkbox"
            checked={selected.has(option.id)}
            onCheckedChange={(checked) => toggle(option.id, checked)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
