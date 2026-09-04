// Rupees everywhere in UI, intent JSON, catalog prices.
// Paise only at the Razorpay boundary.

export const toPaise = (inr: number): number => Math.round(inr * 100)

export const fromPaise = (paise: number): number => paise / 100

export const formatInr = (inr: number): string =>
  `₹${inr.toLocaleString("en-IN")}`
