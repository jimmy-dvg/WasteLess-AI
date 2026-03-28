import { ImageResponse } from "next/og";

export const size = {
	width: 512,
	height: 512,
};

export const contentType = "image/png";

export default function Icon() {
	return new ImageResponse(
		(
			<div
				style={{
					height: "100%",
					width: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "linear-gradient(135deg, #16a34a 0%, #10b981 50%, #14b8a6 100%)",
					color: "white",
					fontSize: 170,
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
