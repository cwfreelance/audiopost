import Image from "next/image";
import styles from "./logo.module.css";

// The lockup artwork, swapped for the dark-background version when the system is in dark mode.
// Only the height is set: the width follows from the artwork's 406.56:108 ratio.
export function Logo({ height }: { height: number }) {
  const width = Math.round((height * 406.56) / 108);
  return (
    <>
      <Image className={styles.light} src="/brand/audiopost-lockup-on-light.svg" alt="audiopost" width={width} height={height} priority />
      <Image className={styles.dark} src="/brand/audiopost-lockup-on-dark.svg" alt="audiopost" width={width} height={height} priority />
    </>
  );
}
