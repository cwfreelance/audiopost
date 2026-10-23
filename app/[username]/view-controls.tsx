"use client";

import { viewUrl, type Filter, type View } from "@/lib/view";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The date filter and sort, in one row. Each change is a new history entry, and the URL drives
// what's shown.
export function ViewControls({ view }: { view: View }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 2006 }, (_, i) => 2007 + i);
  const { filter } = view;
  const go = (next: Partial<View>) => window.history.pushState(null, "", viewUrl({ ...view, ...next }));
  // Choosing a mode from Any time starts at this year.
  const setFilter = (next: Partial<Filter>) => go({ filter: { mode: "in", year: thisYear, ...filter, ...next } });

  return (
    <div>
      <select
        aria-label="Date filter"
        value={filter?.mode ?? ""}
        onChange={(e) =>
          e.target.value ? setFilter({ mode: e.target.value as Filter["mode"] }) : go({ filter: undefined })
        }
      >
        <option value="">Any time</option>
        <option value="in">In</option>
        <option value="before">Before</option>
        <option value="after">After</option>
      </select>
      <select
        aria-label="Year"
        disabled={!filter}
        value={filter?.year ?? thisYear}
        onChange={(e) => setFilter({ year: Number(e.target.value) })}
      >
        {years.map((year) => (
          <option key={year}>{year}</option>
        ))}
      </select>
      <select
        aria-label="Month"
        disabled={!filter}
        value={filter?.month ?? ""}
        onChange={(e) => setFilter({ month: Number(e.target.value) || undefined })}
      >
        <option value="">Whole year</option>
        {MONTHS.map((month, i) => (
          <option key={month} value={i + 1}>
            {month}
          </option>
        ))}
      </select>
      <select aria-label="Sort" value={view.sort} onChange={(e) => go({ sort: e.target.value as View["sort"] })}>
        <option value="newest">Newest → Oldest</option>
        <option value="oldest">Oldest → Newest</option>
      </select>
    </div>
  );
}
