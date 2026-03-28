import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "WasteLess AI",
		short_name: "WasteLess",
		description: "AI-powered food scanning to reduce household waste.",
		start_url: "/",
		display: "standalone",
		background_color: "#f8fafc",
		theme_color: "#10b981",
		orientation: "portrait",
		lang: "en",
		icons: [
			{
				src: "/icon",
				sizes: "512x512",
				type: "image/png",
			},
			{
				src: "/apple-icon",
				sizes: "180x180",
				type: "image/png",
			},
		],
	};
}
