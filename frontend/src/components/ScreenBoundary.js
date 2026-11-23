import React from "react";
import { Link } from "react-router-dom";
import { Rotate } from "../glyphs";
import { t } from "../i18n";

/**
 * Catches a crash inside one screen so the rest of the app stays alive.
 * Without this, any render error unmounts the whole React tree and leaves
 * only the navy page background: the "black screen" players were stuck on.
 *
 * Keyed by route in App.js, so moving to another tab always gives the next
 * screen a clean slate.
 */
class ScreenBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged as plain strings: the native consoles (Xcode, Safari Web Inspector,
    // Android Logcat) print objects as "[object Object]" and drop the stack.
    // eslint-disable-next-line no-console
    console.error(
      `[CipherRush] screen crashed at ${window.location.pathname}: ${error?.stack || error}` +
        `\nComponent stack:${info?.componentStack || " (none)"}`
    );
  }

  retry() {
    this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
  }

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    }
    return (
      <div className="page-screen screen-error" role="alert">
        <div className="screen-error-card">
          <h1>{this.props.title || t("boundary.title")}</h1>
          <p>{t("boundary.body")}</p>
          <div className="screen-error-actions">
            <button className="btn-primary" onClick={this.retry}>
              <Rotate size={18} /> {t("boundary.retry")}
            </button>
            <Link className="btn-secondary" to="/dashboard" onClick={this.retry}>
              {t("nav.home")}
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default ScreenBoundary;
