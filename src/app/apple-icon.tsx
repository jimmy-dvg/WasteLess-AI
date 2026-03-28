import { ImageResponse } from "next/og";

export const size = {
	width: 180,
	height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
	return new ImageResponse(
		(
			<div
				style={{
					height: "100%",
					width: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#10b981",
					borderRadius: 36,
					color: "white",
					fontSize: 72,
					fontWeight: 800,
					letterSpacing: "-0.06em",
					fontFamily: "sans-serif",
				}}
			>
				WL
			</div>
		),
		size
	);
}
