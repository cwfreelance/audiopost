import Link from "next/link";
import { Logo } from "@/app/logo";
import { UsernameForm } from "@/app/username-form";
import styles from "./not-found.module.css";

// A bad address, or a username that can't exist. The field lets the visitor try another blog.
export default function NotFound() {
  return (
    <main className={styles.notFound}>
      <Link href="/">
        <Logo height={36} />
      </Link>
      <h1>Oops, I think you (or your AI agent) are hallucinating...</h1>
      <UsernameForm />
    </main>
  );
}
