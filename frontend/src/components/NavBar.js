import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Trophy, User, Versus } from "../glyphs";

const NAV_ITEMS = [
  { to: "/dashboard", Icon: Home, label: "Home" },
  { to: "/battle", Icon: Versus, label: "Versus" },
  { to: "/leaderboard", Icon: Trophy, label: "Ranks" },
  { to: "/profile", Icon: User, label: "Profile" },
];

function NavBar() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_ITEMS.map(({ to, Icon, label }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default NavBar;
