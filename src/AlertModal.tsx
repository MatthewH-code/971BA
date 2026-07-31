import { useEffect } from "react";

interface Props {
  kind: "warn" | "danger";
  title?: string;
  text: string;
  onClose: () => void;
}

export default function AlertModal({ kind, title, text, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title ?? "100-hour inspection"}</h3>
        <div className={kind === "danger" ? "alert alert-danger" : "alert alert-warn"}>
          {text}
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
