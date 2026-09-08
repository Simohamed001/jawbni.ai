"use client";

import { useCallback, useEffect, useState } from "react";
import { CategoryTree, type TreeNode } from "@/components/inbox/CategoryTree";
import { MessageList, type CityOption, type MessageItem } from "@/components/inbox/MessageList";
import { MessageComposer } from "@/components/inbox/MessageComposer";
import { MoreVertical, Search, SquarePen } from "lucide-react";
import { UNDEFINED_LABEL } from "@/lib/utils";

export function InboxLayout() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [groupReply, setGroupReply] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<CityOption[]>([]);

  function findFirstPopulatedNode(nodes: TreeNode[]): TreeNode | null {
    for (const node of nodes) {
      if (node.count > 0) return node;
      const child = node.children && findFirstPopulatedNode(node.children);
      if (child) return child;
    }
    return null;
  }

  useEffect(() => {
    fetch("/api/settings/cities")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const active = Array.isArray(data) ? data : [];
        setCities(
          active
            .filter((c: { isActive: boolean }) => c.isActive)
            .map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            })),
        );
      })
      .catch(() => setCities([]));
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/tree");
      const data = await res.json();
      
      // Ensure data is an array
      const treeData = Array.isArray(data) ? data : [];
      setTree(treeData);
      
      if (!selected && treeData[0]) {
        setSelected(findFirstPopulatedNode(treeData) || treeData[0]);
      }
    } catch (error) {
      console.error("Error loading tree:", error);
      setTree([]);
    }
  }, [selected]);

  const loadMessages = useCallback(async () => {
    if (!selected?.mainCategoryId) return;
    const params = new URLSearchParams({
      mainCategoryId: selected.mainCategoryId,
    });
    if (selected.subCategoryId)
      params.set("subCategoryId", selected.subCategoryId);
    if (selected.productName) params.set("productName", selected.productName);
    if (search) params.set("q", search);

    const res = await fetch(`/api/messages?${params}`);
    const data = await res.json();
    setMessages(data);

    const product = await fetch("/api/products").then((r) => r.json());
    const productId = product.find(
      (p: { officialName: string }) => p.officialName === selected.productName
    )?.id;

    const replyParams = new URLSearchParams({
      mainCategoryId: selected.mainCategoryId,
    });
    if (productId) replyParams.set("productId", productId);
    if (selected.subCategoryId)
      replyParams.set("subCategoryId", selected.subCategoryId);

    const replies = await fetch(`/api/group-replies?${replyParams}`).then((r) =>
      r.json()
    );
    setGroupReply(replies[0]?.replyText || "");
  }, [selected, search]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function saveGroupReply() {
    if (!selected?.mainCategoryId) return;
    setSaving(true);
    try {
      const products = await fetch("/api/products").then((r) => r.json());
      const productId = products.find(
        (p: { officialName: string }) =>
          p.officialName === selected.productName &&
          selected.productName !== UNDEFINED_LABEL
      )?.id;

      await fetch("/api/group-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainCategoryId: selected.mainCategoryId,
          productId: productId || null,
          subCategoryId: selected.subCategoryId || null,
          replyText: groupReply,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  // ربط رسالة بمدينة شحن (أو إلغاء الربط عند cityId = null)
  async function assignCity(id: string, cityId: string | null) {
    const res = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId }),
    });
    if (res.ok) {
      loadMessages();
    }
  }

  async function updateTranscription(id: string, transcription: string) {
    await fetch(`/api/messages/${id}/classify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcription }),
    });
    loadMessages();
    loadTree();
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Sidebar - WhatsApp Style */}
      <aside className="w-80 shrink-0 border-l bg-white flex flex-col">
        <div className="flex items-center justify-between border-b bg-[#f0f2f5] px-4 py-3">
          <h2 className="text-xl font-bold text-[#111b21]">التصنيفات</h2>
          <div className="flex items-center gap-1 text-gray-600">
            <button type="button" className="rounded-full p-2 hover:bg-white" aria-label="تصنيف جديد">
              <SquarePen className="h-5 w-5" />
            </button>
            <button type="button" className="rounded-full p-2 hover:bg-white" aria-label="المزيد">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-3">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في الرسائل..."
              className="w-full bg-[#f0f2f5] rounded-lg py-1.5 pr-10 pl-4 text-sm outline-none"
            />
            <Search className="absolute right-3 top-2 h-4 w-4 text-gray-500" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tree.length > 0 ? (
            <CategoryTree
              tree={tree}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          ) : (
            <div className="p-4 text-center text-gray-500">
              لا توجد تصنيفات حالياً
            </div>
          )}
        </div>
      </aside>

      {/* Chat Area */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#efeae2] relative">
        {/* Chat Header */}
        {selected && (
          <div className="flex items-center gap-3 border-b bg-[#f0f2f5] px-4 py-3 z-10">
            <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 font-bold">
              {selected.label[0]}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{selected.label}</h3>
              <p className="text-[10px] text-gray-500">متصل الآن</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 relative overflow-hidden">
          {/* Background Pattern Overlay */}
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://w0.peakpx.com/wallpaper/580/650/HD-wallpaper-whatsapp-bg-whatsapp-texture.jpg')] bg-repeat" />

          <div className="relative h-full">
            <MessageList
              messages={messages}
              cities={cities}
              onUpdateTranscription={updateTranscription}
              onAssignCity={assignCity}
            />
          </div>
        </div>

        <MessageComposer
          onSent={() => {
            loadTree();
            loadMessages();
          }}
        />
      </section>
    </div>
  );
}
