export function ArenaMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`arena-mark ${compact ? "arena-mark-compact" : ""}`}
    />
  );
}
export function Logo() {
  return (
    <div className="logo-lockup">
      <ArenaMark />
      <strong>
        arena<span className="logo-dot">.</span>
      </strong>
    </div>
  );
}
