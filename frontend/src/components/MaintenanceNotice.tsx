import { useEffect, useState } from "react";

/** How long the full message is shown before it shrinks into the corner. */
const EXPANDED_MS = 3500;

/**
 * The warning must never get in the way: it floats over the top-right corner,
 * has nothing to dismiss, and shrinks itself to a small countdown so a student
 * can carry on with whatever they were doing until maintenance takes over.
 */
export function MaintenanceNotice({ seconds }: { seconds: number }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setCollapsed(true), EXPANDED_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`maintenance-notice ${collapsed ? "maintenance-notice--small" : ""}`}
      role="status"
      aria-live="polite"
    >
      <p className="maintenance-notice__headline">
        {collapsed
          ? `Maintenance in ${seconds}s`
          : `Maintenance mode is starting in ${seconds} seconds.`}
      </p>
      <p className="maintenance-notice__detail">
        Please don&apos;t start any new submissions, uploads, or edits while
        maintenance is starting. If you&apos;re currently working on something,
        please wait until maintenance is complete before continuing.
      </p>
    </div>
  );
}
