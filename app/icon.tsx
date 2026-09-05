import { ImageResponse } from "next/og"

// The favicon, drawn from the same mark as the Trust Boundary component: a
// solid ground crossed once by a single line — the authorization boundary.
// No external asset, no dependency beyond next/og (bundled with Next.js).
export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0B0B0C",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: 3,
            background: "#FAFAF8",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            background: "#FAFAF8",
          }}
        />
      </div>
    ),
    { ...size },
  )
}
