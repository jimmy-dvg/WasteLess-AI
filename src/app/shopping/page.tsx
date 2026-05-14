"use client";

import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { ShoppingCart, Trash2, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

type ShoppingItem = { recipeTitle?: string; name: string; amount?: number; unit?: string };

const SHOPPING_STORAGE_KEY = "wasteless.shopping-list";

export default function ShoppingPage() {
    const [items, setItems] = useState<ShoppingItem[]>([]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
            setItems(raw ? JSON.parse(raw) : []);
        } catch (err) {
            setItems([]);
        }
    }, []);

    function save(next: ShoppingItem[]) {
        setItems(next);
        try {
            localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(next));
        } catch {
            // ignore
        }
    }

    const removeAt = (idx: number) => {
        const next = items.slice();
        next.splice(idx, 1);
        save(next);
    };

    const clearAll = () => {
        save([]);
        try {
            localStorage.removeItem(SHOPPING_STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    const copyText = async () => {
        try {
            const lines = items.map((it) => `${it.name}${it.amount ? ` x${it.amount}` : ""}${it.unit ? ` ${it.unit}` : ""}`);
            await navigator.clipboard.writeText(lines.join("\n"));
            // small feedback could be added
        } catch {
            // ignore
        }
    };

    return (
        <main className="min-h-screen bg-[#f5f6f8] px-4 py-8 pb-28">
            <div className="mx-auto w-full max-w-sm space-y-6">
                <section className="rounded-3xl border border-slate-100 bg-white px-5 py-6 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)]">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <ShoppingCart className="h-6 w-6 text-sky-700" aria-hidden="true" />
                            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Shopping List</h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <Link href="/" className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Back</Link>
                            <button onClick={copyText} className="rounded-xl border bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">Copy</button>
                            <button onClick={clearAll} className="rounded-xl border bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Clear</button>
                        </div>
                    </div>

                    <p className="mt-3 text-sm text-slate-600">Items are stored in your browser's localStorage.</p>
                </section>

                <section className="rounded-3xl border border-slate-100 bg-white px-5 py-5 shadow-[0_16px_38px_-24px_rgba(15,23,42,0.35)]">
                    {items.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Your shopping list is empty.</div>
                    ) : (
                        <ul className="space-y-3">
                            {items.map((it, idx) => (
                                <li key={`${it.name}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3">
                                    <div>
                                        <div className="font-medium text-slate-900">{it.name}</div>
                                        <div className="text-xs text-slate-500">{it.amount ?? ''} {it.unit ?? ''} {it.recipeTitle ? `— ${it.recipeTitle}` : ''}</div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button onClick={() => removeAt(idx)} className="rounded-md border bg-red-50 px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-100">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <BottomNav />
        </main>
    );
}
