import { redirect } from "next/navigation";

/** The app opens on the briefs. */
export default function AppIndex() {
  redirect("/app/briefs");
}
