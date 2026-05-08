"use client";

import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/src/lib/use-auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ItemRow = { id: string; name: string; expiryDate: string | null };

export default function InventoryPage() {
    const router = useRouter();
    const { isLoading: isAuthLoading, getAuthHeader } = useAuth();
    const [items, setItems] = useState<ItemRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                        ? data.map((r: any) => ({ id: String(r.id ?? ""), name: String(r.name ?? ""), expiryDate: String(r.expiryDate ?? r.expiry_date ?? null) }))
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
                <h1 className="text-2xl font-semibold mb-4">Inventory</h1>

                {isAuthLoading || isLoading ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-slate-500">No items found.</p>
                ) : (
                    <ul className="space-y-2">
                        {items.map((it) => (
                            <li key={it.id} className="p-3 border rounded-md">
                                <div className="font-medium">{it.name}</div>
                                <div className="text-xs text-slate-500">{it.expiryDate ?? "No expiry"}</div>
                            </li>
                        ))}
                    </ul>
                )}
            </main>

            <BottomNav />
        </div>
    );
}
