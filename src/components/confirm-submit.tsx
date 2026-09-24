"use client";

/** A submit button that asks for confirmation before its form submits. */
export function ConfirmSubmit({
  children,
  confirmMessage,
  className = "text-sm text-bad",
}: {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
