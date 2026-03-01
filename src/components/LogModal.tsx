// src/components/LogModal.tsx
import { useEffect, useState } from "react";
import type { UrgeEntry, UrgeType } from "../core/types";

export function LogModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (entry: Omit<UrgeEntry, "id" | "ts">) => void;
}) {
  const [type, setType] = useState<UrgeType>("scrolling");
  const [customLabel, setCustomLabel] = useState("");
  const [intensity, setIntensity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [resisted, setResisted] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    // fresh form each open
    setType("scrolling");
    setCustomLabel("");
    setIntensity(3);
    setResisted(true);
    setNote("");
  }, []);

  const canSave = type !== "custom" || customLabel.trim().length > 0;

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <div className="modalCard">
        <div className="modalTop">
          <h2>Log Trigger</h2>
          <button className="btn ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as UrgeType)}>
            <option value="scrolling">Scrolling</option>
            <option value="gaming">Gaming</option>
            <option value="junk food">Junk Food</option>
            <option value="late-night snacking">Late-night snacking</option>
            <option value="shopping/spending">Shopping / Spending</option>
            <option value="gambling">Gambling</option>
            <option value="alcohol">Alcohol</option>
            <option value="weed">Weed</option>
            <option value="vape">Vape</option>
            <option value="cigs/cigars">Cigs / Cigars</option>
            <option value="porn">Porn</option>
            <option value="custom">Custom</option>
          </select>

          {type === "custom" && (
            <input
              className="input"
              value={customLabel}
              placeholder="Label (required)"
              onChange={(e) => setCustomLabel(e.target.value)}
            />
          )}
        </div>

        <div className="field">
          <label>Intensity: {intensity}</label>
          <input
            className="range"
            type="range"
            min={1}
            max={5}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value) as any)}
          />
        </div>

        <div className="field">
          <label>Outcome</label>
          <div className="seg">
            <button className={`btn ${resisted ? "primary" : "ghost"}`} onClick={() => setResisted(true)} type="button">
              Resisted
            </button>
            <button className={`btn ${!resisted ? "primary" : "ghost"}`} onClick={() => setResisted(false)} type="button">
              Gave In
            </button>
          </div>
        </div>

        <div className="field">
          <label>Note (optional)</label>
          <textarea
            className="textarea"
            value={note}
            placeholder="Trigger, situation, what helped, etc."
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className="modalActions">
          <button className="btn ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() =>
              onSave({
                type,
                customLabel: type === "custom" ? customLabel.trim() : undefined,
                intensity,
                resisted,
                note: note.trim() ? note.trim() : undefined,
              })
            }
            type="button"
          >
            Save
          </button>
        </div>

        {!canSave && <div className="tiny warn">Custom label required.</div>}
      </div>
    </div>
  );
}