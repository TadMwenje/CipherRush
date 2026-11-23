import React, { useState } from "react";
import { Bulb } from "../glyphs";
import { stepText, useLanguage, useT } from "../i18n";

// Step-through tutorial for one mode (constants/walkthroughs.js). Lives inside
// the How to Play sheet, so it never interrupts a round.
function Walkthrough({ steps }) {
  const [index, setIndex] = useState(0);
  const t = useT();
  const lang = useLanguage();
  const step = steps[index];
  const text = stepText(step, lang);
  // Tile labels like "ROT-13" or "URL" read the same everywhere and have no key.
  const demoLabel = (label) => (t(`demo.${label}`) === `demo.${label}` ? label : t(`demo.${label}`));
  const last = index === steps.length - 1;

  return (
    <section className="walkthrough" aria-roledescription="tutorial">
      <div className="walkthrough-count">{t("walk.step", { i: index + 1, n: steps.length })}</div>
      <h3 className="walkthrough-title">{text.title}</h3>
      <p className="walkthrough-body">{text.body}</p>

      {step.demo && (
        // Keyed by step so the tiles replay their reveal on every step.
        <div className="walkthrough-demo" key={index} aria-hidden="true">
          {step.demo.rows.map((row) => (
            <div key={row.label} className={`walkthrough-row ${row.dim ? "dim" : ""} ${row.accent ? "accent" : ""}`}>
              <span className="walkthrough-label">{demoLabel(row.label)}</span>
              <span className={`walkthrough-cells ${step.demo.bytes ? "bytes" : ""}`}>
                {[...(Array.isArray(row.cells) ? row.cells : row.cells.split(""))].map((cell, i) => (
                  <span key={i} className="walkthrough-cell" style={{ animationDelay: `${i * 70}ms` }}>
                    {cell}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {text.tip && (
        <p className="walkthrough-tip">
          <Bulb size={14} /> {text.tip}
        </p>
      )}

      <div className="walkthrough-nav">
        <button type="button" className="walkthrough-btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
          {t("walk.back")}
        </button>
        <div className="walkthrough-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className={i === index ? "on" : ""} />
          ))}
        </div>
        <button type="button" className="walkthrough-btn primary" onClick={() => setIndex(last ? 0 : index + 1)}>
          {last ? t("walk.startOver") : t("walk.next")}
        </button>
      </div>
    </section>
  );
}

export default Walkthrough;
