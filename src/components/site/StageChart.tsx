/**
 * Pipeline-by-stage bar chart. Stage labels are the real ones from the deals
 * board; the values are a sample shape, labelled as such in the caption.
 */
const STAGES = [
  { label: "Sales qualified", value: 4.81, deals: 38 },
  { label: "Proposal sent", value: 3.02, deals: 44 },
  { label: "Commercials agreed", value: 1.94, deals: 17 },
  { label: "Verbal win", value: 1.44, deals: 19 },
  { label: "Closed won", value: 0.86, deals: 11 },
];

const MAX = Math.max(...STAGES.map((s) => s.value));

export function StageChart() {
  return (
    <figure className="glass glow m-0 p-6">
      <figcaption className="mb-5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">Open pipeline by stage</span>
        <span className="mono text-[10.5px] text-[var(--faint)]">sample shape</span>
      </figcaption>

      <div className="flex flex-col gap-3.5">
        {STAGES.map((stage, i) => (
          <div key={stage.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-[var(--muted)]">{stage.label}</span>
              <span className="mono tabular text-[12px]">
                {"₹"}
                {stage.value.toFixed(2)} Cr
              </span>
            </div>
            <div
              className="h-[7px] w-full overflow-hidden rounded-full"
              style={{ background: "var(--track)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(stage.value / MAX) * 100}%`,
                  background: "var(--accent)",
                  opacity: 1 - i * 0.14,
                  animation: `growBar 1s var(--ease) ${i * 90}ms both`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 border-t border-[var(--line)] pt-4 text-[12px] leading-relaxed text-[var(--faint)]">
        Stage names are read from the board at query time. Rename a stage in monday.com and the
        grouping follows it.
      </p>
    </figure>
  );
}
