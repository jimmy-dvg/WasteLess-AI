"use client";

import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/src/lib/use-auth";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { getStorageZoneLabel, type StorageZone } from "@/src/lib/storage-zone";

type ItemRow = { id: string; name: string; expiryDate: string | null; storageZone: string; shelfLifeDays?: number; createdAt?: string | null };

const SHOPPING_STORAGE_KEY = "wasteless.shopping-list";

export default function InventoryPage() {
    const router = useRouter();
    const { isLoading: isAuthLoading, getAuthHeader } = useAuth();
    const [items, setItems] = useState<ItemRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
    const [activeZone, setActiveZone] = useState<StorageZone | "all">("all");
    const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
    const [editName, setEditName] = useState("");
    const [editShelfDays, setEditShelfDays] = useState<number | "">("");
    const [editZoneField, setEditZoneField] = useState<StorageZone>("fridge");

    const ZONE_ORDER: StorageZone[] = ["fridge", "freezer", "dry_storage", "drinks", "other"];
    const ZONE_ICONS: Record<StorageZone, string> = {
        fridge: "🥬",
        freezer: "❄️",
        dry_storage: "🥫",
        drinks: "☕",
        other: "📦",
    };
    const ZONE_STYLES: Record<string, { bg: string; border: string; accent: string; filledBg?: string; filledText?: string }> = {
        fridge: { bg: "bg-emerald-100", border: "border-emerald-300", accent: "text-emerald-800", filledBg: "bg-emerald-700", filledText: "text-white" },
        freezer: { bg: "bg-sky-100", border: "border-sky-300", accent: "text-sky-800", filledBg: "bg-sky-700", filledText: "text-white" },
        dry_storage: { bg: "bg-amber-100", border: "border-amber-300", accent: "text-amber-800", filledBg: "bg-amber-700", filledText: "text-white" },
        drinks: { bg: "bg-violet-100", border: "border-violet-300", accent: "text-violet-800", filledBg: "bg-violet-700", filledText: "text-white" },
        other: { bg: "bg-slate-100", border: "border-slate-300", accent: "text-slate-800", filledBg: "bg-slate-700", filledText: "text-white" },
    };

    const groups = useMemo(() => {
        const map = new Map<StorageZone, ItemRow[]>();
        ZONE_ORDER.forEach((z) => map.set(z, []));
        for (const it of items) {
            const z = (it.storageZone as StorageZone) ?? "other";
            const arr = map.get(z) ?? [];
            arr.push(it);
            map.set(z, arr);
        }
        return map;
    }, [items]);

    useEffect(() => {
        const load = async () => {
            try {
                setIsLoading(true);
                const headers = getAuthHeader();
                const res = await fetch("/api/pantry", { headers });
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    throw payload?.details ?? "Failed to load pantry";
                }
                const data = await res.json();
                setItems(
                    Array.isArray(data)
                        ? data.map((r: any) => {
                              const createdAt = r.createdAt ? new Date(String(r.createdAt)) : null;
                              const shelf = Number(r.shelfLifeDays ?? r.shelf_life_days ?? 0);
                              let expiry: string | null = null;
                              if (createdAt && shelf > 0) {
                                  const d = new Date(createdAt);
                                  d.setDate(d.getDate() + Math.round(shelf));
                                  expiry = d.toLocaleDateString();
                              }

                              return {
                                  id: String(r.id ?? ""),
                                  name: String(r.name ?? "Unnamed item"),
                                  expiryDate: expiry,
                                  storageZone: String(r.storageZone ?? r.storage_zone ?? "other"),
                                  shelfLifeDays: Number(r.shelfLifeDays ?? r.shelf_life_days ?? 0),
                                  createdAt: r.createdAt ? String(r.createdAt) : null,
                              } as ItemRow;
                          })
                        : []
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err ?? "Unknown error"));
            } finally {
                setIsLoading(false);
            }
        };

        // Only load if auth is loaded
        if (!isAuthLoading) {
            void load();
        }
    }, [getAuthHeader, isAuthLoading]);

    return (
        <div className="min-h-screen bg-white">
            <main className="max-w-3xl mx-auto p-4">
                <h1 className="text-3xl font-extrabold text-slate-900 mb-4">Inventory</h1>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveZone("all")}
                        className={`px-3 py-1 rounded-full text-sm font-medium ${activeZone === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                    >
                        All ({items.length})
                    </button>

                    {ZONE_ORDER.map((zone) => {
                        const count = groups.get(zone)?.length ?? 0;
                        const style = ZONE_STYLES[zone] ?? ZONE_STYLES.other;
                        return (
                            <button
                                key={zone}
                                type="button"
                                onClick={() => setActiveZone(zone)}
                                className={`px-3 py-1 rounded-full text-sm font-medium ${activeZone === zone ? `${style.filledBg ?? 'bg-slate-900'} ${style.filledText ?? 'text-white'} shadow-sm` : 'bg-slate-100 text-slate-700'}`}
                            >
                                <span className="mr-1">{ZONE_ICONS[zone]}</span>
                                {getStorageZoneLabel(zone)} ({count})
                            </button>
                        );
                    })}
                </div>

                {isAuthLoading || isLoading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-slate-500">No items found.</p>
                ) : (
                    <>
                        {selectedIds.size > 0 ? (
                            <div className="mb-4 flex items-center gap-3">
                                <span className="text-sm font-semibold">{selectedIds.size} selected</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // open confirm modal
                                        setPendingDeleteIds(new Set(selectedIds));
                                        setShowConfirm(true);
                                    }}
                                    className="rounded-md border bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
                                >
                                    Delete
                                </button>

                                <select
                                    onChange={async (e) => {
                                        const zone = e.target.value;
                                        if (!zone) return;
                                        setIsLoading(true);
                                        try {
                                            const headers = getAuthHeader();
                                            const res = await fetch('/api/pantry', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json', ...headers },
                                                body: JSON.stringify({ updates: Array.from(selectedIds).map(id => ({ id, storageZone: zone })) }),
                                            });
                                            if (!res.ok) {
                                                const payload = await res.json().catch(() => ({}));
                                                throw new Error(String(payload?.details ?? 'Failed to move items'));
                                            }
                                            // optimistic UI: just clear selection and show message
                                            setItems((cur) => cur.map(i => selectedIds.has(i.id) ? { ...i, storageZone: zone } : i));
                                            setSelectedIds(new Set());
                                            setActionMessage('Moved items.');
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
                                        } finally {
                                            setIsLoading(false);
                                            (e.target as HTMLSelectElement).value = '';
                                            setTimeout(() => setActionMessage(null), 2200);
                                        }
                                    }}
                                    className="rounded-md border bg-white text-slate-900 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                >
                                    <option value="">Move to zone…</option>
                                    <option value="fridge">Fridge</option>
                                    <option value="dry_storage">Pantry</option>
                                    <option value="freezer">Freezer</option>
                                    <option value="drinks">Drinks</option>
                                </select>

                                <button
                                    type="button"
                                    onClick={() => {
                                        try {
                                            const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
                                            const existing = raw ? JSON.parse(raw) : [];
                                            const toAdd = items.filter(it => selectedIds.has(it.id)).map(it => ({ recipeTitle: '', name: it.name, amount: 1, unit: 'pcs' }));
                                            localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(existing.concat(toAdd)));
                                            setSelectedIds(new Set());
                                            setActionMessage('Added to shopping list.');
                                            setTimeout(() => setActionMessage(null), 2200);
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
                                        }
                                    }}
                                    className="rounded-md border bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
                                >
                                    Add to Shopping
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedIds(new Set())}
                                    className="rounded-md border bg-slate-50 px-2 py-1 text-sm text-slate-700"
                                >
                                    Clear
                                </button>
                            </div>
                        ) : null}

                        {actionMessage ? <p className="mb-3 text-sm text-green-700">{actionMessage}</p> : null}

                        {ZONE_ORDER.map((zone) => {
                            if (activeZone !== "all" && zone !== activeZone) return null;
                            const list = groups.get(zone) ?? [];
                            if (!list || list.length === 0) return null;
                            const style = ZONE_STYLES[zone] ?? ZONE_STYLES.other;

                            return (
                                <section key={zone} className="mb-6">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className={`${style.bg} ${style.border} inline-block h-3 w-3 rounded-full border`} />
                                            <h2 className={`text-sm font-semibold ${style.accent}`}>{getStorageZoneLabel(zone)} <span className="ml-2 text-xs text-slate-500">({list.length})</span></h2>
                                        </div>
                                    </div>

                                    <ul className="space-y-2">
                                        {list.map((it, idx) => (
                                            <li key={it.id || `${zone}-${idx}`} className="p-3 border border-slate-100 rounded-md flex items-start gap-3 bg-white transform transition duration-150 hover:shadow-md hover:-translate-y-1">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(it.id)}
                                                    onChange={(e) => {
                                                        setSelectedIds((current) => {
                                                            const next = new Set(current);
                                                            if (e.target.checked) next.add(it.id); else next.delete(it.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className="mt-1"
                                                />

                                                    <div className="flex-1">
                                                        <div className="font-medium text-slate-900">{it.name}</div>
                                                        <div className="text-xs text-slate-600">{it.expiryDate ?? "No expiry"}</div>
                                                    </div>

                                                <div className="flex items-center gap-2">
                                                    <select
                                                                                value={it.storageZone}
                                                                                onChange={async (e) => {
                                                            const newZone = e.target.value;
                                                            if (!newZone || newZone === it.storageZone) return;
                                                            setIsLoading(true);
                                                            try {
                                                                const headers = getAuthHeader();
                                                                const res = await fetch('/api/pantry', {
                                                                    method: 'PATCH',
                                                                    headers: { 'Content-Type': 'application/json', ...headers },
                                                                    body: JSON.stringify({ updates: [{ id: it.id, storageZone: newZone }] }),
                                                                });
                                                                if (!res.ok) {
                                                                    const payload = await res.json().catch(() => ({}));
                                                                    throw new Error(String(payload?.details ?? 'Failed to move item'));
                                                                }
                                                                setItems((current) => current.map((x) => (x.id === it.id ? { ...x, storageZone: newZone } : x)));
                                                                setActionMessage('Moved item.');
                                                            } catch (err) {
                                                                setError(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
                                                            } finally {
                                                                setIsLoading(false);
                                                                setTimeout(() => setActionMessage(null), 1800);
                                                            }
                                                            }}
                                                            className="rounded-md border bg-white text-slate-900 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                                    >
                                                        <option value="">Move…</option>
                                                        <option value="fridge">Fridge</option>
                                                        <option value="dry_storage">Pantry</option>
                                                        <option value="freezer">Freezer</option>
                                                        <option value="drinks">Drinks</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingItem(it);
                                                            setEditName(it.name);
                                                            setEditShelfDays(typeof it.shelfLifeDays === 'number' ? it.shelfLifeDays : '');
                                                            setEditZoneField((it.storageZone as StorageZone) ?? 'other');
                                                        }}
                                                        title="Edit item"
                                                        className="ml-2 rounded-md border bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                                                    >
                                                        ✏️
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            );
                        })}
                    </>
                )}
            </main>

            <AnimatePresence>
                {actionMessage ? (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 shadow-lg"
                    >
                        {actionMessage}
                    </motion.div>
                ) : null}

                {showConfirm ? (
                    <motion.div
                        key="confirm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center"
                    >
                        <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(false)} />

                        <motion.div
                            initial={{ y: 12, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 8, opacity: 0 }}
                            className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="confirm-title"
                        >
                            <h3 id="confirm-title" className="text-lg font-semibold">Confirm deletion</h3>
                            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete {pendingDeleteIds.size} item(s)? This action cannot be undone.</p>

                            <div className="mt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(false)}
                                    className="rounded-md border bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        setIsLoading(true);
                                        try {
                                            const headers = getAuthHeader();
                                            const res = await fetch('/api/pantry', {
                                                method: 'DELETE',
                                                headers: { 'Content-Type': 'application/json', ...headers },
                                                body: JSON.stringify({ ids: Array.from(pendingDeleteIds) }),
                                            });
                                            if (!res.ok) {
                                                const payload = await res.json().catch(() => ({}));
                                                throw new Error(String(payload?.details ?? 'Failed to delete items'));
                                            }
                                            setItems((current) => current.filter((it) => !pendingDeleteIds.has(it.id)));
                                            setSelectedIds(new Set());
                                            setPendingDeleteIds(new Set());
                                            setShowConfirm(false);
                                            setActionMessage('Deleted items.');
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
                                        } finally {
                                            setIsLoading(false);
                                            setTimeout(() => setActionMessage(null), 2200);
                                        }
                                    }}
                                    className="rounded-md border bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
                {editingItem ? (
                    <motion.div
                        key="edit"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center"
                    >
                        <div className="absolute inset-0 bg-black/40" onClick={() => setEditingItem(null)} />

                        <motion.div
                            initial={{ y: 12, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 8, opacity: 0 }}
                            className="relative z-50 w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="edit-title"
                        >
                            <h3 id="edit-title" className="text-lg font-semibold">Edit item</h3>

                                    <div className="mt-3 space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600">Name</label>
                                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600">Shelf life (days)</label>
                                    <input type="number" min={0} value={String(editShelfDays)} onChange={(e) => setEditShelfDays(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 w-full rounded-md border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-600">Storage zone</label>
                                    <select value={editZoneField} onChange={(e) => setEditZoneField(e.target.value as StorageZone)} className="mt-1 w-full rounded-md border bg-white text-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200">
                                        <option value="fridge">Fridge</option>
                                        <option value="dry_storage">Pantry</option>
                                        <option value="freezer">Freezer</option>
                                        <option value="drinks">Drinks</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setEditingItem(null)} className="rounded-md border bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>

                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!editingItem) return;
                                        setIsLoading(true);
                                        try {
                                            const payload: any = { id: editingItem.id };
                                            if (editName.trim()) payload.name = editName.trim();
                                            if (editShelfDays !== '') payload.shelfLifeDays = Number(editShelfDays ?? 0);
                                            if (editZoneField) payload.storageZone = editZoneField;

                                            const headers = getAuthHeader();
                                            const res = await fetch('/api/pantry', {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json', ...headers },
                                                body: JSON.stringify({ updates: [payload] }),
                                            });
                                            if (!res.ok) {
                                                const j = await res.json().catch(() => ({}));
                                                throw new Error(String(j?.details ?? 'Failed to update item'));
                                            }

                                            // update UI
                                            setItems((cur) =>
                                                cur.map((it) => {
                                                    if (it.id !== editingItem.id) return it;
                                                    const createdAt = it.createdAt ? new Date(String(it.createdAt)) : null;
                                                    let expiry = it.expiryDate;
                                                    const shelf = payload.shelfLifeDays ?? it.shelfLifeDays ?? 0;
                                                    if (createdAt && shelf > 0) {
                                                        const d = new Date(createdAt);
                                                        d.setDate(d.getDate() + Math.round(shelf));
                                                        expiry = d.toLocaleDateString();
                                                    }

                                                    return {
                                                        ...it,
                                                        name: payload.name ?? it.name,
                                                        shelfLifeDays: shelf,
                                                        storageZone: payload.storageZone ?? it.storageZone,
                                                        expiryDate: expiry,
                                                    };
                                                })
                                            );

                                            setActionMessage('Item updated.');
                                            setEditingItem(null);
                                        } catch (err) {
                                            setError(err instanceof Error ? err.message : String(err ?? 'Unknown error'));
                                        } finally {
                                            setIsLoading(false);
                                            setTimeout(() => setActionMessage(null), 1800);
                                        }
                                    }}
                                    className="rounded-md border bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
                                >
                                    Save
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <BottomNav />
        </div>
    );
}
