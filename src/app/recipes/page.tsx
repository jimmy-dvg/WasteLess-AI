"use client";

import BottomNav from "@/components/BottomNav";
import { useEffect, useState } from "react";

type PantryItem = {
	id: string;
	name: string;
	category: string;
	shelfLifeDays: number;
	createdAt: string;
};

export default function RecipesPage() {
	const [items, setItems] = useState<PantryItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		const loadItems = async () => {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				const response = await fetch("/api/pantry");
				const data: unknown = await response.json();

				if (!response.ok) {
					const details =
						typeof data === "object" && data !== null && "details" in data
							? String((data as { details?: string }).details ?? "")
							: "Failed to load pantry data.";

					throw new Error(details);
				}

				if (!Array.isArray(data)) {
					throw new Error("Invalid pantry response format.");
				}

				const normalized = data
					.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
					.map((item) => ({
						id: String(item.id ?? ""),
						name: String(item.name ?? "Unknown"),
						category: String(item.category ?? "Other"),
						shelfLifeDays: Number(item.shelfLifeDays ?? 0),
						createdAt: String(item.createdAt ?? ""),
					}));

				setItems(normalized);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Failed to load pantry items.";
				setErrorMessage(message);
			} finally {
				setIsLoading(false);
			}
		};

		void loadItems();
	}, []);

	return (
		<main className="min-h-screen bg-slate-50 px-4 py-8 pb-28">
			<div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h1 className="text-2xl font-bold text-slate-900">Recipes</h1>
				<p className="mt-3 text-sm text-slate-600">Saved pantry items from your database.</p>

				{isLoading ? <p className="mt-4 text-sm text-slate-500">Loading pantry...</p> : null}

				{errorMessage ? (
					<p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
						{errorMessage}
					</p>
				) : null}

				{!isLoading && !errorMessage && items.length === 0 ? (
					<p className="mt-4 text-sm text-slate-500">
						No pantry records yet. Scan food first to save items.
					</p>
				) : null}

				{items.length > 0 ? (
					<ul className="mt-4 space-y-2">
						{items.map((item) => (
							<li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
								<p className="font-medium text-slate-900">{item.name}</p>
								<p className="text-xs text-slate-600">
									{item.category} • {item.shelfLifeDays} day{item.shelfLifeDays === 1 ? "" : "s"}
								</p>
							</li>
						))}
					</ul>
				) : null}
			</div>
			<BottomNav />
		</main>
	);
}