import { redirect } from "next/navigation";

export default function Home() {
  // Paste mode (zero Freelancer connection) is the default, safe entry point.
  redirect("/write");
}
