import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthSession {
	token: string | null;
	isAuthenticated: boolean;
}

/**
 * Custom hook to manage JWT auth session from localStorage
 */
export function useAuth() {
	const router = useRouter();
	const [session, setSession] = useState<AuthSession>({ token: null, isAuthenticated: false });
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		// Get token from localStorage
		const token = localStorage.getItem('authToken');
		if (token) {
			setSession({ token, isAuthenticated: true });
		} else {
			setSession({ token: null, isAuthenticated: false });
			// Redirect to login if not authenticated
			router.replace('/login');
		}
		setIsLoading(false);
	}, [router]);

	useEffect(() => {
		// Handler to sync auth state when token changes (cross-tab or same-tab)
		const syncAuth = () => {
			const t = localStorage.getItem('authToken');
			if (t) {
				setSession({ token: t, isAuthenticated: true });
			} else {
				setSession({ token: null, isAuthenticated: false });
			}
			setIsLoading(false);
		};

		// Listen for storage events (other tabs)
		window.addEventListener('storage', syncAuth);
		// Listen for same-tab custom event dispatched after login/logout
		window.addEventListener('wasteless-auth-changed', syncAuth as EventListener);

		return () => {
			window.removeEventListener('storage', syncAuth);
			window.removeEventListener('wasteless-auth-changed', syncAuth as EventListener);
		};
	}, []);

	const logout = useCallback(() => {
		localStorage.removeItem('authToken');
		setSession({ token: null, isAuthenticated: false });
		router.replace('/login');
	}, [router]);

	const getAuthHeader = useCallback(() => {
		const headers: Record<string, string> = {};
		if (session.token) headers.Authorization = `Bearer ${session.token}`;
		return headers;
	}, [session.token]);

	return { session, isLoading, logout, getAuthHeader };
}
