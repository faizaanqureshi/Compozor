"use client";

import { useId } from "react";
import { LandingChart } from "@/components/landing-chart";
import { cn } from "@/lib/utils";

export const exampleExpenses = [
  { category: "Travel", amount: 680, receipts: 3, color: "bg-chart-2" },
  {
    category: "Office & supplies",
    amount: 420,
    receipts: 2,
    color: "bg-chart-4",
  },
  { category: "Software", amount: 240, receipts: 3, color: "bg-chart-5" },
];
export const exampleExpenseTotal = exampleExpenses.reduce(
  (sum, item) => sum + item.amount,
  0,
);
export const money = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);

export function ExpenseBreakdown({ sample = false }: { sample?: boolean }) {
  return (
    <LandingChart enabled={!sample}>
      <figcaption className="mb-5 text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
        Spending by category
      </figcaption>
      <div className="space-y-4">
        {exampleExpenses.map((item, index) => (
          <div key={item.category}>
            <div className="mb-2 flex justify-between gap-3 text-xs">
              <span>{item.category}</span>
              <span className="tabular-nums">
                {sample ? "—" : money(item.amount)}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                data-chart-part="bar-x"
                className={cn(
                  "h-full rounded-full",
                  sample ? "bg-border" : item.color,
                )}
                style={{
                  width: `${(item.amount / exampleExpenseTotal) * 100}%`,
                  animationDelay: `${index * 70}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[0.6875rem] sm:text-[0.625rem] text-muted-foreground">
        {sample
          ? "Chart placement from your sample"
          : "Share of the month’s total · CAD"}
      </p>
    </LandingChart>
  );
}

const spending = [
  { day: 3, amount: 240 },
  { day: 7, amount: 420 },
  { day: 11, amount: 480 },
  { day: 14, amount: 780 },
  { day: 18, amount: 960 },
  { day: 21, amount: 1040 },
  { day: 25, amount: 1240 },
  { day: 29, amount: 1340 },
];
const chartX = (day: number) => 28 + ((day - 3) / 26) * 273;
const chartY = (amount: number) => 128 - (amount / exampleExpenseTotal) * 96;
const line = spending
  .map(({ day, amount }) => `${chartX(day)},${chartY(amount)}`)
  .join(" ");

export function SpendingTrend({ sample = false }: { sample?: boolean }) {
  return (
    <LandingChart enabled={!sample}>
      <figcaption className="mb-3 text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
        Cumulative spend · August
      </figcaption>
      <svg
        viewBox="0 0 330 165"
        className="w-full overflow-visible"
        role="img"
        aria-label={
          sample
            ? "Sample chart layout, with no client values"
            : "Cumulative expenses rise from 240 dollars on August 3 to 1,340 dollars on August 29"
        }
      >
        <path
          d="M28 32H312 M28 80H312 M28 128H312"
          className="stroke-border"
          fill="none"
          strokeWidth="0.7"
        />
        {!sample && (
          <>
            <polygon
              data-chart-part="wash"
              points={`28,128 ${line} 301,128`}
              className="fill-chart-4/10"
            />
            <polyline
              data-chart-part="stroke"
              pathLength="1"
              strokeDasharray="1"
              points={line}
              className="stroke-chart-4"
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {spending.map(({ day, amount }, index) => (
              <circle
                key={index}
                data-chart-part="point"
                style={{ animationDelay: `${160 + index * 65}ms` }}
                cx={chartX(day)}
                cy={chartY(amount)}
                r={index === 7 ? 3 : 2}
                className="fill-chart-4"
              />
            ))}
          </>
        )}
        <g className="fill-muted-foreground" fontSize="10">
          <text x="28" y="150">
            03 Aug
          </text>
          <text x="155" y="150" textAnchor="middle">
            Mid-month
          </text>
          <text x="301" y="150" textAnchor="end">
            29 Aug
          </text>
          <text x="28" y="20">
            {sample ? "—" : "$1,340"}
          </text>
          <text x="18" y="132" textAnchor="end">
            0
          </text>
        </g>
      </svg>
      <p className="text-[0.6875rem] sm:text-[0.625rem] text-muted-foreground">
        {sample
          ? "Client figures appear in the prepared version"
          : "8 illustrative purchases · statement and receipt data"}
      </p>
    </LandingChart>
  );
}

export function EvidenceIndex() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 border-y border-border py-5">
        <Metric label="Evidence groups" value="03" />
        <Metric label="Source files" value="05" />
        <Metric label="Review notes" value="01" />
      </div>
      <p className="mt-7 text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
        Evidence map
      </p>
      <ol className="mt-4">
        {[
          [
            "01",
            "Identity & travel",
            "Passport.pdf · pp. 1–2",
            "Name and document dates indexed",
          ],
          [
            "02",
            "Employment history",
            "Employer_letter.pdf · p. 1",
            "Role and employment period summarized",
          ],
          [
            "03",
            "Education",
            "Degree.pdf + Transcript.pdf + Translation.pdf",
            "Qualifications grouped with supporting records",
          ],
        ].map(([number, title, source, note]) => (
          <li
            key={number}
            className="relative flex gap-4 border-b border-border py-4 last:border-0"
          >
            <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">
              {number}
            </span>
            <div>
              <p className="text-sm">{title}</p>
              <p className="mt-1 text-[0.6875rem] sm:text-[0.625rem] leading-relaxed text-muted-foreground">
                {source}
              </p>
              <p className="mt-2 text-xs leading-relaxed">{note}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-l-2 border-accent bg-muted/40 px-4 py-3">
        <p className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
          For the reviewer
        </p>
        <p className="mt-2 text-xs leading-relaxed">
          The employer letter omits weekly hours. Confirm this detail before
          relying on the employment summary.
        </p>
      </div>
    </div>
  );
}

export function IncomeSummary() {
  const months = [
    { month: "June", pay: 5200, deposit: 4010 },
    { month: "July", pay: 5200, deposit: 3995 },
    { month: "August", pay: 5200, deposit: 4020 },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 border-y border-border py-5">
        <Metric label="Monthly gross pay" value="$5,200" />
        <Metric label="Periods reviewed" value="03" />
      </div>
      <LandingChart className="mt-7">
        <figcaption className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
          Gross pay & recorded deposits
        </figcaption>
        <div className="mt-4 flex flex-wrap gap-4 text-[0.6875rem] sm:text-[0.625rem] text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="size-2 bg-chart-2" aria-hidden />
            Gross pay
          </span>
          <span className="flex items-center gap-2">
            <i className="size-2 bg-chart-4" aria-hidden />
            Deposits
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-6">
          {months.map((m, index) => (
            <div key={m.month}>
              <div
                className="flex h-28 items-end justify-center gap-2 border-b border-border"
                aria-hidden
              >
                <div
                  data-chart-part="bar-y"
                  className="w-5 rounded-t-sm bg-chart-2"
                  style={{
                    height: `${(m.pay / 6000) * 100}%`,
                    animationDelay: `${index * 70}ms`,
                  }}
                />
                <div
                  data-chart-part="bar-y"
                  className="w-5 rounded-t-sm bg-chart-4"
                  style={{
                    height: `${(m.deposit / 6000) * 100}%`,
                    animationDelay: `${index * 70 + 40}ms`,
                  }}
                />
              </div>
              <p className="mt-3 text-center text-xs">{m.month}</p>
              <p className="mt-1 text-center text-[0.6875rem] sm:text-[0.625rem] tabular-nums text-muted-foreground">
                {money(m.pay)} / {money(m.deposit)}
              </p>
            </div>
          ))}
        </div>
      </LandingChart>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Gross pay and bank deposits shown separately. Differences may reflect
        payroll deductions; no equivalence is assumed.
      </p>
      <div className="mt-5 border-t border-border pt-4 text-[0.6875rem] sm:text-[0.625rem] leading-relaxed text-muted-foreground">
        Sources: Pay_statements.pdf · pp. 1–3; Bank_statements.pdf ·
        June–August. Prepared for advisor review, not an eligibility decision.
      </div>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="min-h-8 text-[0.6875rem] uppercase tracking-normal text-muted-foreground sm:min-h-0 sm:text-[0.625rem] sm:tracking-widest">
        {label}
      </p>
      <p className="mt-2 text-2xl font-light tabular-nums tracking-tight sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

export function ExpenseAllocation() {
  const maskId = useId();
  const strokes = ["stroke-chart-2", "stroke-chart-4", "stroke-chart-5"];
  return (
    <LandingChart className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 140 140"
        className="mx-auto size-40 shrink-0 sm:mx-0"
        role="img"
        aria-label="Expense allocation: travel 50.7 percent, office and supplies 31.3 percent, software 17.9 percent"
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="140"
            height="140"
          >
            <circle
              data-chart-part="stroke"
              cx="70"
              cy="70"
              r="54"
              fill="none"
              stroke="white"
              strokeWidth="12"
              pathLength="1"
              strokeDasharray="1"
              transform="rotate(-90 70 70)"
            />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {exampleExpenses.map((item, i) => {
            const share = (item.amount / exampleExpenseTotal) * 100;
            const start =
              (exampleExpenses
                .slice(0, i)
                .reduce((sum, expense) => sum + expense.amount, 0) /
                exampleExpenseTotal) *
              100;
            return (
              <circle
                key={item.category}
                cx="70"
                cy="70"
                r="54"
                fill="none"
                strokeWidth="9"
                pathLength="100"
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-start}
                transform="rotate(-90 70 70)"
                className={strokes[i]}
              />
            );
          })}
        </g>
        <text
          x="70"
          y="69"
          textAnchor="middle"
          className="fill-foreground"
          fontSize="20"
        >
          $1,340
        </text>
        <text
          x="70"
          y="85"
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize="9"
        >
          AUGUST / CAD
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <figcaption className="mb-4 text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
          Expense composition
        </figcaption>
        <dl className="space-y-3">
          {exampleExpenses.map((item) => (
            <div
              key={item.category}
              className="flex justify-between gap-3 text-xs"
            >
              <dt className="flex items-center gap-2">
                <i
                  className={cn("size-1.5 shrink-0 rounded-full", item.color)}
                  aria-hidden
                />
                {item.category}
              </dt>
              <dd className="tabular-nums">{money(item.amount)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </LandingChart>
  );
}
