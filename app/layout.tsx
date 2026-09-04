import type { ReactNode } from "react"

export const metadata = {
  title: "AgentIntent",
  description: "Merchant-side intent and policy gateway in front of Razorpay Test Mode",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
