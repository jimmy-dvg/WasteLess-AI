"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type AuthMode = "login" | "signup";

export default function LoginPage() {
	const router = useRouter();

	const [mode, setMode] = useState<AuthMode>("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);
		setSuccessMessage(null);

		if (!email.trim() || !password.trim()) {
			setErrorMessage("Please enter both email and password.");
			return;
		}

		try {
			setIsSubmitting(true);

			const response = await fetch("/api/auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: mode,
					email: email.trim(),
					password,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Authentication failed");
			}

			// Store JWT token
			localStorage.setItem("authToken", data.token);

			if (mode === "signup") {
				setSuccessMessage("Account created successfully! Redirecting...");
				setTimeout(() => {
					router.push("/");
					router.refresh();
				}, 1500);
			} else {
				router.push("/");
				router.refresh();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred";
			setErrorMessage(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#f8fafc_0%,_#ffffff_52%,_#ecfdf5_100%)] px-4 py-10">
			<section className="w-full max-w-sm rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-[0_28px_48px_-28px_rgba(15,23,42,0.45)] backdrop-blur">
				<div className="flex items-center justify-center">
					<div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
						<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
						WasteLess AI
					</div>
				</div>

				<h1 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900">
					{mode === "login" ? "Welcome back" : "Create your account"}
				</h1>
				<p className="mt-2 text-center text-sm text-slate-600">
					{mode === "login"
						? "Sign in to manage your food and reduce waste."
						: "Join WasteLess AI and start tracking your pantry."}
				</p>

				<form onSubmit={handleSubmit} className="mt-6 space-y-4">
					<div>
						<label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
							Email
						</label>
						<input
							id="email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@example.com"
							className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
							disabled={isSubmitting}
							required
						/>
					</div>

					<div>
						<label htmlFor="password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
							Password
						</label>
						<input
							id="password"
							type="password"
							autoComplete={mode === "login" ? "current-password" : "new-password"}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="Enter your password"
							className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
							disabled={isSubmitting}
							required
						/>
					</div>

					{errorMessage ? (
						<p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
							{errorMessage}
						</p>
					) : null}

					{successMessage ? (
						<p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
							{successMessage}
						</p>
					) : null}

					<button
						type="submit"
						disabled={isSubmitting}
						className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
					>
						<span>{isSubmitting ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}</span>
						<ArrowRight className="h-4 w-4" aria-hidden="true" />
					</button>
				</form>

				<button
					type="button"
					onClick={() => {
						setMode((current) => (current === "login" ? "signup" : "login"));
						setErrorMessage(null);
						setSuccessMessage(null);
					}}
					className="mt-5 w-full text-center text-sm font-medium text-emerald-700 transition hover:text-emerald-800"
				>
					{mode === "login" ? "No account? Switch to Sign Up" : "Already have an account? Switch to Login"}
				</button>

				<div className="mt-6 pt-6 border-t border-slate-200 text-xs text-slate-600">
					<p className="font-medium mb-2">Demo Account:</p>
					<p>Email: <span className="font-mono">demo@example.com</span></p>
					<p>Password: <span className="font-mono">demo123</span></p>
				</div>
			</section>
		</main>
	);
}