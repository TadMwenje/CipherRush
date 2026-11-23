import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Trophy, User, Versus } from "../glyphs";
import { useT } from "../i18n";

const NAV_ITEMS = [
  { to: "/dashboard", Icon: Home, label: "nav.home" },
  { to: "/battle", Icon: Versus, label: "nav.versus" },
  { to: "/leaderboard", Icon: Trophy, label: "nav.ranks" },
  { to: "/profile", Icon: User, label: "nav.profile" },
];

function NavBar() {
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_ITEMS.map(({ to, Icon, label }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>
          <Icon size={22} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default NavBar;
