"use client";

import BottomNav from "@/components/BottomNav";
import {
	getStorageZoneLabel,
	resolveStorageZone,
	type StorageZone,
} from "@/src/lib/storage-zone";
import { getSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { AnimatePresence, motion } from "framer-motion";
import { Camera } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type DetectedFoodItem = {
	name: string;
	category: string;
	shelfLifeDays: number;
	storageZone: StorageZone;
};

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}

			reject(new Error("Failed to read image file."));
		};
		reader.onerror = () => reject(new Error("Failed to read image file."));
		reader.readAsDataURL(file);
	});
}

export default function ScanPage() {
	const router = useRouter();
	const supabase = useMemo(() => getSupabaseBrowserClient(), []);
	const [isAuthChecking, setIsAuthChecking] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [detectedItems, setDetectedItems] = useState<DetectedFoodItem[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [infoMessage, setInfoMessage] = useState<string | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		let isMounted = true;

		const syncAuthState = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!isMounted) {
				return;
			}

			if (!session?.access_token) {
				setIsAuthenticated(false);
				setIsAuthChecking(false);
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
			setIsAuthChecking(false);
		};

		void syncAuthState();

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (!isMounted) {
				return;
			}

			if (!session?.access_token) {
				setIsAuthenticated(false);
				router.replace("/login");
				return;
			}

			setIsAuthenticated(true);
		});

		return () => {
			isMounted = false;
			subscription.unsubscribe();
		};
	}, [router, supabase]);

	useEffect(() => {
		if (!selectedFile) {
			setPreviewUrl(null);
			return;
		}

		const objectUrl = URL.createObjectURL(selectedFile);
		setPreviewUrl(objectUrl);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [selectedFile]);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;
		setSelectedFile(file);
		setDetectedItems([]);
		setErrorMessage(null);
		setInfoMessage(null);
	};

	const handleProcessImage = async () => {
		if (!selectedFile || isProcessing || isAuthChecking || !isAuthenticated) {
			return;
		}

		setIsProcessing(true);
		setErrorMessage(null);
		setInfoMessage(null);

		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				router.replace("/login");
				throw new Error("Please log in to scan and save food items.");
			}

			const imageBase64 = await fileToBase64(selectedFile);

			const response = await fetch("/api/analyze", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({ imageBase64 }),
			});

			const fallbackType = response.headers.get("x-analysis-fallback");
			const usedFallback = Boolean(fallbackType);

			const data: unknown = await response.json();

			if (!response.ok) {
				const apiError =
					typeof data === "object" && data !== null
						? String((data as { error?: string }).error ?? "Image processing failed.")
						: "Image processing failed.";

				const details =
					typeof data === "object" && data !== null && "details" in data
						? String((data as { details?: string }).details ?? "")
						: "";

				const formattedError = details ? `${apiError} ${details}` : apiError;

				throw new Error(formattedError);
			}

			if (!Array.isArray(data)) {
				throw new Error("Invalid response format from analysis API.");
			}

			const normalized = data
				.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
				.map((item) => {
					const category = String(item.category ?? "Uncategorized").trim() || "Uncategorized";
					const rawShelfLife = Number(item.shelfLifeDays ?? 0);

					return {
						name: String(item.name ?? "Unknown").trim() || "Unknown",
						category,
						shelfLifeDays: Number.isFinite(rawShelfLife)
							? Math.max(0, Math.round(rawShelfLife))
							: 0,
						storageZone: resolveStorageZone(item.storageZone ?? item.storage_zone, category),
					};
				});

			setDetectedItems(normalized);

			let infoText: string | null = null;

			const pantryPayload = normalized.map((item) => ({
				name: item.name,
				category: item.category,
				shelfLifeDays: item.shelfLifeDays,
				storageZone: item.storageZone,
			}));

			const saveResponse = await fetch("/api/pantry", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify(pantryPayload),
			});

			const saveData: unknown = await saveResponse.json().catch(() => null);

			if (!saveResponse.ok) {
				const saveDetails =
					typeof saveData === "object" && saveData !== null
						? String(
								(saveData as { details?: string; error?: string }).details ??
									(saveData as { details?: string; error?: string }).error ??
									""
							).trim()
						: "";

				infoText = saveDetails
					? `AI analysis finished, but database save failed: ${saveDetails}`
					: "AI analysis finished, but database save failed.";
			} else {
				const insertedCount =
					typeof saveData === "object" && saveData !== null && "inserted" in saveData
						? Number((saveData as { inserted?: number }).inserted ?? 0)
						: 0;

				const compatibilityMode =
					typeof saveData === "object" && saveData !== null && "compatibilityMode" in saveData
						? Boolean((saveData as { compatibilityMode?: boolean }).compatibilityMode)
						: false;

				const countLabel = insertedCount === 1 ? "item" : "items";
				infoText =
					insertedCount > 0
						? `Saved ${insertedCount} ${countLabel} to your pantry database.`
						: "Saved detected items to your pantry database.";

				if (compatibilityMode) {
					infoText = `${infoText} Compatibility mode is active until all pantry migrations are applied.`;
				}
			}

			if (usedFallback) {
				const fallbackMessage =
					fallbackType === "quota"
						? "Showing sample results because Gemini quota is exceeded."
						: fallbackType === "image"
							? "Showing sample results because the image could not be processed reliably."
							: "Showing sample results because AI analysis is temporarily unavailable.";

				infoText = infoText ? `${infoText} ${fallbackMessage}` : fallbackMessage;
			}

			if (infoText) {
				setInfoMessage(infoText);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unable to process image.";
			setDetectedItems([]);
			setErrorMessage(message);
		} finally {
			setIsProcessing(false);
		}
	};

	if (isAuthChecking) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 px-4">
				<p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
					Checking session...
				</p>
			</main>
		);
	}

	if (!isAuthenticated) {
		return null;
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 px-4 py-8 pb-28">
			<div className="mx-auto w-full max-w-sm">
				<h1 className="text-3xl font-bold tracking-tight text-slate-900">Scan Food</h1>
				<p className="mt-2 text-sm text-slate-600">
					Snap a photo of your food item and let AI help you reduce waste.
				</p>

				<input
					ref={fileInputRef}
					id="food-photo-input"
					type="file"
					accept="image/*"
					capture="environment"
					onChange={handleFileChange}
					className="sr-only"
				/>

				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-300/70 bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-5 text-lg font-semibold text-white shadow-[0_12px_28px_-12px_rgba(16,185,129,0.8)] transition duration-200 hover:from-emerald-600 hover:to-green-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
				>
					<Camera className="h-6 w-6" aria-hidden="true" />
					<span>Tap to Take Photo</span>
				</button>

				<div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur">
					{previewUrl ? (
						<div className="relative h-64 w-full overflow-hidden rounded-xl">
							<Image
								src={previewUrl}
								alt="Selected food preview"
								fill
								sizes="(max-width: 640px) 100vw, 384px"
								className="object-cover"
								unoptimized
							/>
						</div>
					) : (
						<div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
							Image preview will appear here
						</div>
					)}
				</div>

				{selectedFile ? (
					<p className="mt-3 truncate text-xs text-slate-500">Selected: {selectedFile.name}</p>
				) : null}

				<button
					type="button"
					onClick={handleProcessImage}
					disabled={!selectedFile || isProcessing}
					className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
				>
					{isProcessing ? "Loading..." : "Process with AI"}
				</button>

				{errorMessage ? (
					<p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
						{errorMessage}
					</p>
				) : null}

				{infoMessage ? (
					<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
						{infoMessage}
					</p>
				) : null}

				<AnimatePresence>
					{detectedItems.length > 0 ? (
						<motion.section
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 6 }}
							transition={{ duration: 0.28, ease: "easeOut" }}
							className="mt-5 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm"
						>
							<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
								Detected Food Items
							</h2>
							<ul className="mt-3 space-y-2">
								{detectedItems.map((item, index) => (
									<li
										key={`${item.name}-${index}`}
										className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
									>
										<p className="font-medium text-slate-900">{item.name}</p>
										<p className="text-xs text-slate-600">
											{item.category} • {getStorageZoneLabel(item.storageZone)} • {item.shelfLifeDays} day
											{item.shelfLifeDays === 1 ? "" : "s"}
										</p>
									</li>
								))}
							</ul>
						</motion.section>
					) : null}
				</AnimatePresence>
			</div>
			<BottomNav />
		</main>
	);
}
