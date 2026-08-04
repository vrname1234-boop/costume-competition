import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { SubmissionStatus } from "../api/types";

export function Card({
  title,
  actions,
  children,
  narrow,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <section className={narrow ? "card card--narrow" : "card"}>
      {(title || actions) && (
        <div className="card__title">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  lead,
}: {
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {lead ? <p>{lead}</p> : null}
    </header>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "ok" | "warn" | "error";
  children: ReactNode;
}) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
};

export function Button({
  variant = "primary",
  small,
  className,
  ...rest
}: ButtonProps) {
  const classes = [
    "button",
    variant === "secondary" ? "button--secondary" : "",
    variant === "danger" ? "button--danger" : "",
    small ? "button--small" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <button type="button" {...rest} className={classes} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Needs changes",
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`status status--${status}`}>{STATUS_LABEL[status]}</span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="table-empty">{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="skeleton">{label}</p>;
}

/**
 * In-page confirmation instead of window.confirm, which browsers prefix with
 * the site's domain and cannot be worded or styled. Escape and the backdrop
 * both cancel, and focus moves to the dialog so it is keyboard-usable.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal__title">{title}</h2>
        <div className="modal__body">{body}</div>
        <div className="button-row">
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
