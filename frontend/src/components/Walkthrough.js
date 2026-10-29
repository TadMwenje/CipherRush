import React, { useState } from "react";
import { Bulb } from "../glyphs";

// Step-through tutorial for one mode (constants/walkthroughs.js). Lives inside
// the How to Play sheet, so it never interrupts a round.
function Walkthrough({ steps }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <section className="walkthrough" aria-roledescription="tutorial">
      <div className="walkthrough-count">
        Step {index + 1} of {steps.length}
      </div>
      <h3 className="walkthrough-title">{step.title}</h3>
      <p className="walkthrough-body">{step.body}</p>

      {step.demo && (
        // Keyed by step so the tiles replay their reveal on every step.
        <div className="walkthrough-demo" key={index} aria-hidden="true">
          {step.demo.rows.map((row) => (
            <div key={row.label} className={`walkthrough-row ${row.dim ? "dim" : ""} ${row.accent ? "accent" : ""}`}>
              <span className="walkthrough-label">{row.label}</span>
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

      {step.tip && (
        <p className="walkthrough-tip">
          <Bulb size={14} /> {step.tip}
        </p>
      )}

      <div className="walkthrough-nav">
        <button type="button" className="walkthrough-btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
          Back
        </button>
        <div className="walkthrough-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i === index ? "on" : ""} />
          ))}
        </div>
        <button
          type="button"
          className="walkthrough-btn primary"
          onClick={() => setIndex(last ? 0 : index + 1)}
        >
          {last ? "Start over" : "Next"}
        </button>
      </div>
    </section>
  );
}

export default Walkthrough;
