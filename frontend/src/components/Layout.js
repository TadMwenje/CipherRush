import React from "react";
import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";

function Layout() {
  return (
    <>
      <Outlet />
      <NavBar />
    </>
  );
}

export default Layout;
