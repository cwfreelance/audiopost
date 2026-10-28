import { useState, type CSSProperties, type RefObject } from "react";
import type { AudioPost } from "@/lib/posts";
import styles from "./now-playing.module.css";

type Props = {
  current?: AudioPost;
  audioRef: RefObject<HTMLAudioElement | null>;
  onPrevious: () => void;
  onNext: () => void;
  onPlay: () => void;
  onEnded: () => void;
  onError: () => void;
};

// The player bar. The logo mark is the play/pause button, its level meter moving while a track
// plays. The playback clock lives here, so its several updates a second re-render only the bar.
export function NowPlaying({ current, audioRef, onPrevious, onNext, onPlay, onEnded, onError }: Props) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration ? Math.min(time / duration, 1) : 0;

  return (
    <section className={styles.bar} aria-label="Now playing" hidden={!current}>
      <button
        type="button"
        className={styles.mark}
        data-playing={playing}
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          const player = audioRef.current!;
          if (player.paused) player.play().catch(() => {});
          else player.pause();
        }}
      >
        <span className={styles.play} />
        <span className={styles.meter}>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      <div className={styles.track}>
        <p>
          {current?.title}
          {current?.artist && ` — ${current.artist}`}
        </p>
        <div className={styles.seek}>
          <span>{clock(time)}</span>
          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${clock(time)} of ${clock(duration)}`}
            min={0}
            max={duration}
            step="any"
            value={Math.min(time, duration)}
            disabled={!duration}
            // Set only once a track has a length, so the server-rendered bar matches the first client render.
            style={duration ? ({ "--progress": `${progress * 100}%` } as CSSProperties) : undefined}
            onChange={(e) => {
              const to = Number(e.target.value);
              audioRef.current!.currentTime = to;
              setTime(to);
            }}
          />
          <span>{clock(duration)}</span>
        </div>
      </div>
      <div className={styles.skip}>
        <button type="button" aria-label="Previous track" onClick={onPrevious}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 5h2.5v14H6zM19 5v14L9 12z" />
          </svg>
        </button>
        <button type="button" aria-label="Next track" onClick={onNext}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 5H18v14h-2.5zM5 5l10 7-10 7z" />
          </svg>
        </button>
      </div>
      <audio
        ref={audioRef}
        controlsList="nodownload"
        onPlay={() => {
          setPlaying(true);
          onPlay();
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        // Streams without a known length report Infinity; their bar stays empty.
        onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        // A new track's source resets the clock.
        onEmptied={() => {
          setTime(0);
          setDuration(0);
        }}
        onEnded={onEnded}
        onError={onError}
      />
    </section>
  );
}

// Seconds as m:ss.
function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
