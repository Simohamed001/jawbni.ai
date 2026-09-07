"use client";

import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronLeft,
  Folder,
  Layers3,
  Package,
  Plus,
} from "lucide-react";
import { useState } from "react";

export interface TreeNode {
  id: string;
  label: string;
  type: "main" | "product" | "sub";
  count: number;
  mainCategoryId?: string;
  productName?: string;
  subCategoryId?: string;
  children?: TreeNode[];
}

interface CategoryTreeProps {
  tree: TreeNode[];
  selectedId?: string;
  onSelect: (node: TreeNode) => void;
}

export function CategoryTree({ tree, selectedId, onSelect }: CategoryTreeProps) {
  return (
    <div className="overflow-y-auto">
      <div className="flex gap-2 overflow-x-auto border-b bg-white px-3 py-2 [scrollbar-width:none]">
        <button className="shrink-0 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          الكل
        </button>
        <button className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
          غير مقروءة
        </button>
        <button className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
          المنتجات
        </button>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="إضافة تصفية"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  onSelect: (node: TreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = !!node.children?.length;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setOpen(!open);
          onSelect(node);
        }}
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-3 text-right transition-colors hover:bg-[#f5f6f6]",
          isSelected && "bg-[#f0f2f5]",
        )}
        style={{ paddingRight: `${depth * 16 + 12}px` }}
      >
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            node.type === "main" && "bg-[#d9fdd3] text-[#075e54]",
            node.type === "product" && "bg-[#dbeafe] text-[#2563eb]",
            node.type === "sub" && "bg-[#fef3c7] text-[#b45309]",
          )}
        >
          {node.type === "main" ? (
            <Layers3 className="h-5 w-5" />
          ) : node.type === "product" ? (
            <Package className="h-5 w-5" />
          ) : (
            <Folder className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-sm", depth === 0 ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
              {node.label}
            </span>
            {node.count > 0 && (
              <span className="shrink-0 text-[11px] text-gray-500">{node.count}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {hasChildren ? (
              open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronLeft className="h-3 w-3" />
              )
            ) : null}
            <span>{node.type === "main" ? "قسم رئيسي" : node.type === "product" ? "منتج" : "قسم فرعي"}</span>
          </div>
        </div>
      </button>

      {open &&
        node.children?.map((child) => (
          <TreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
