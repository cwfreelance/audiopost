import { Mark } from "@/app/mark";
import { UsernameForm } from "@/app/username-form";
import type { CSSProperties } from "react";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.home} data-wide>
      {/* The wordmark as live text in the logo's face, sized to run the full width of the page. */}
      <h1 className={styles.wordmark}>
        <span>audio</span>
        <span>post</span>
      </h1>
      <hr className={styles.perforation} />
      <div className={styles.intro}>
        <div className={styles.start}>
          <p className={styles.lede}>Type a tumblr username to display and listen to their audio posts.</p>
          <UsernameForm />
          <p className={styles.small}>
            Free and <a href="https://github.com/cwfreelance/audiopost">open source</a>.
          </p>
        </div>
        <Sheet />
      </div>
      <hr className={styles.perforation} />
      <ul className={styles.facts}>
        <li>
          <h2>Any public tumblr user</h2>
          <p>All audio posts, newest or oldest first, filter by year or month.</p>
        </li>
        <li>
          <h2>Tracks</h2>
          <p>
            Songs uploaded to tumblr play here. SoundCloud, Spotify, and Bandcamp posts play in their own players
            respectively.
          </p>
        </li>
        <li>
          <h2>Keep listening on the go</h2>
          <p>Each tumblr song leads into the next. Lock screen and headphone buttons work as usual.</p>
        </li>
      </ul>
    </main>
  );
}

// A sheet of six stamps, postmarked. Their meters rise in turn as the page loads.
function Sheet() {
  return (
    <div className={styles.sheet} aria-hidden="true">
      <div className={styles.stamps}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Mark key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </div>
      <svg className={styles.postmark} viewBox="0 0 220 120">
        <defs>
          <path id="postmark-ring" d="M60 60m-41 0a41 41 0 1 1 82 0a41 41 0 1 1-82 0" />
        </defs>
        <circle cx="60" cy="60" r="54" />
        <circle cx="60" cy="60" r="30" />
        <text>
          <textPath href="#postmark-ring" textLength="252" lengthAdjust="spacing">
            AUDIOPOST • EST. 2026 •
          </textPath>
        </text>
        <path className={styles.play} d="M53 47v26l20-13z" />
        {[28, 46, 64, 82, 100].map((y) => (
          <path key={y} d={`M122 ${y}q12-9 24 0t24 0t24 0t24 0`} />
        ))}
      </svg>
    </div>
  );
}
