"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { parseUsername } from "@/lib/username";
import styles from "./username-form.module.css";

export function UsernameForm() {
  const router = useRouter();
  const errorId = useId();
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const input = new FormData(event.currentTarget).get("username");
        const username = parseUsername(String(input));
        setInvalid(!username);
        if (username) router.push(`/${username}`);
      }}
    >
      <input
        name="username"
        aria-label="tumblr username"
        placeholder="tumblr username"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
      />
      <button type="submit">Listen</button>
      {invalid && (
        <p id={errorId} className={styles.error} role="alert">
          That doesn&apos;t look like a tumblr username.
        </p>
      )}
    </form>
  );
}
