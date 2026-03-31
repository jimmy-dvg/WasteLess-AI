"use client";

import { Home, Refrigerator, ScanLine, UserRound, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "home" | "scan" | "inventory" | "recipes" | "profile";

const tabs = [
	{ key: "home" as const, label: "Home", href: "/", icon: Home },
	{ key: "inventory" as const, label: "Inventory", href: "/inventory", icon: Refrigerator },
	{ key: "scan" as const, label: "Scan", href: "/scan", icon: ScanLine },
	{ key: "recipes" as const, label: "Recipes", href: "/recipes", icon: UtensilsCrossed },
	{ key: "profile" as const, label: "Profile", href: "/profile", icon: UserRound },
];

export default function BottomNav() {
	const pathname = usePathname();

	const activeTab: TabKey = pathname.startsWith("/inventory")
			? "inventory"
		: pathname.startsWith("/scan")
			? "scan"
		: pathname.startsWith("/recipes")
			? "recipes"
		: pathname.startsWith("/profile")
			? "profile"
			: "home";

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:p-4">
			<nav className="pointer-events-auto w-full max-w-md rounded-t-3xl border border-white/40 bg-white/60 p-2 shadow-lg backdrop-blur-xl">
				<ul className="flex items-center justify-between gap-1">
					{tabs.map((tab) => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.key;

						return (
							<li key={tab.key} className="flex-1">
								<Link
									href={tab.href}
									className={`flex w-full flex-col items-center justify-center rounded-2xl px-3 py-2 text-xs font-medium transition ${
										isActive
											? "bg-green-100/90 text-green-600"
											: "text-slate-600 hover:bg-white/60 hover:text-slate-800"
									}`}
								>
									<Icon className="mb-1 h-5 w-5" />
									<span>{tab.label}</span>
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</div>
	);
}
