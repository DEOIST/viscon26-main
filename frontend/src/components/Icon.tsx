type IconName =
    | "cap"
    | "arrow"
    | "back"
    | "lock"
    | "check"
    | "user"
    | "trophy"
    | "sun"
    | "moon"
    | "close"
    | "slot";
const paths: Record<IconName, string> = {
    cap: "m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6m4-3v9",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    back: "M20 12H4m6-6-6 6 6 6",
    lock: "M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 5v2",
    check: "m5 12 4 4L19 6",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
    trophy: "M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v6m-4 0h8",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
    moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
    close: "m6 6 12 12M6 18 18 6",
    slot: "M3 6h18v13H3V6Zm5 4-3 3 3 3m8-6 3 3-3 3m-3-7-2 8",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={paths[name]} />
        </svg>
    );
}
