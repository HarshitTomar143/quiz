import { redirect } from "next/navigation";

// Opening the site takes users straight to the quiz (which shows the
// disclaimer first). The admin panel lives at /admin and is intentionally
// not linked anywhere — it's a "secret" URL.
export default function Home() {
  redirect("/quiz");
}
