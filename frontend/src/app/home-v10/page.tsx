import { redirect } from "next/navigation";

/**
 * /home-v10 — compatibility redirect.
 *
 * V10 "The Glass Loupe" was promoted to the root homepage; this route only
 * keeps old local links working.
 */
export default function HomeV10Redirect() {
  redirect("/");
}
