import { Logo } from "@/app/logo";
import { UsernameForm } from "@/app/username-form";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.home}>
      <h1>
        <Logo height={108} />
      </h1>
      <p>Browse and play any Tumblr blog&apos;s audio posts.</p>
      <UsernameForm />
    </main>
  );
}
