import Razorpay from "razorpay"

let client: Razorpay | null = null

export function getRazorpayClient(): Razorpay {
  if (client) return client

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay credentials missing: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env",
    )
  }
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error(
      "Refusing to boot: RAZORPAY_KEY_ID is not a Test Mode key (must start with rzp_test_)",
    )
  }

  client = new Razorpay({ key_id: keyId, key_secret: keySecret })
  return client
}
