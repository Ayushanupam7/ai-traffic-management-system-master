import { redirect } from "next/navigation";

export default function HistoryRunDetailRedirect() {
  // The per-run detail view now lives inline as a drawer inside the Lab page.
  redirect("/lab");
}
