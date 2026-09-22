import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Compozor — Less chasing. More work delivered.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const [sans, display] = await Promise.all([
    readFile(join(process.cwd(), "app/fonts/neue-montreal/PPNeueMontreal-Regular.otf")),
    readFile(join(process.cwd(), "app/fonts/denton/DentonTest-Thin.otf")),
  ]);
  // ImageResponse has no CSS custom properties. These are the corresponding
  // background, foreground, and accent brand tokens from globals.css.
  const palette = { background: "#F6F1E7", foreground: "#122023", accent: "#A9822F" };

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%",
      padding: "60px 72px", background: palette.background, color: palette.foreground,
      fontFamily: "Neue Montreal" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 34 }}>Compozor</span>
        <span style={{ fontSize: 18, color: palette.accent }}>CLIENT WORK, CONSIDERED.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 58,
        fontFamily: "Denton", fontSize: 100, fontWeight: 100, lineHeight: 1.04,
        letterSpacing: "-3px" }}>
        <span>Less chasing.</span>
        <span>More work delivered.</span>
      </div>
      <div style={{ display: "flex", marginTop: "auto", paddingTop: 24,
        borderTop: `1px solid ${palette.accent}`, fontSize: 25 }}>
        Client communication. Document collection. Workflows.
      </div>
    </div>,
    { ...size, fonts: [
      { name: "Neue Montreal", data: sans, weight: 400, style: "normal" },
      { name: "Denton", data: display, weight: 100, style: "normal" },
    ] },
  );
}
