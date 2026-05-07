import { useEffect, useState } from 'react';
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
			router.push('/login');
		}
		setIsLoading(false);
	}, [router]);

	const logout = () => {
		localStorage.removeItem('authToken');
		setSession({ token: null, isAuthenticated: false });
		router.push('/login');
	};

	const getAuthHeader = () => {
		const headers: Record<string, string> = {};
		if (session.token) headers.Authorization = `Bearer ${session.token}`;
		return headers;
	};

	return { session, isLoading, logout, getAuthHeader };
}
