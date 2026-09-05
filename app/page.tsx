import { redirect } from "next/navigation"

// The gateway is the product. There is nothing to land on ahead of it.
export default function Home(): never {
  redirect("/demo")
}
