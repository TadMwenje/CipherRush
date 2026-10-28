/*
 * Email confirmation card and the forgot-password view in the login modal.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import api from "../api";
import * as AuthContext from "../AuthContext";
import VerifyEmailCard from "./VerifyEmail";
import AuthModal from "./AuthModal";
import AccountSettings from "./AccountSettings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function signedInAs(user) {
  const updateUser = jest.fn();
  jest.spyOn(AuthContext, "useAuth").mockReturnValue({ user, updateUser });
  return updateUser;
}

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const button = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

test("the confirm card only shows for unverified accounts", () => {
  signedInAs({ username: "p", is_verified: true });
  act(() => root.render(<VerifyEmailCard />));
  expect(container.textContent).toBe("");
});

test("entering the emailed code verifies the account", async () => {
  const updateUser = signedInAs({ username: "p", is_verified: false });
  const post = jest.spyOn(api, "post").mockResolvedValue({ data: { user: { is_verified: true } } });
  act(() => root.render(<VerifyEmailCard />));
  expect(container.textContent).toContain("Confirm your email");

  const input = container.querySelector("input");
  type(input, "12a3456789");
  expect(input.value).toBe("123456"); // digits only, six at most
  await act(async () => button("Confirm").click());
  await flush();
  expect(post).toHaveBeenCalledWith("/me/verify-email", { code: "123456" });
  expect(updateUser).toHaveBeenCalledWith({ is_verified: true });
});

test("a wrong code shows the server's message", async () => {
  signedInAs({ username: "p", is_verified: false });
  jest.spyOn(api, "post").mockRejectedValue({ response: { data: { detail: "That code isn't right. 4 tries left." } } });
  act(() => root.render(<VerifyEmailCard />));
  type(container.querySelector("input"), "000000");
  await act(async () => button("Confirm").click());
  await flush();
  expect(container.textContent).toContain("4 tries left");
});

test("forgot password sends the handle and shows the same reply whatever happens", async () => {
  const reply = "If an account exists for that handle/email, a reset link has been sent.";
  const post = jest.spyOn(api, "post").mockResolvedValue({ data: { message: reply } });
  jest.spyOn(api, "get").mockResolvedValue({ data: { google: false, apple: false } });
  act(() => root.render(<AuthModal isOpen onClose={() => {}} onLogin={() => {}} />));
  await flush(); // let the sign-in buttons finish asking which providers are on
  act(() => button("Forgot password?").click());
  type(container.querySelector("#auth-forgot"), " Some_Handle ");
  await act(async () => button("Email me a link").click());
  await flush();
  expect(post).toHaveBeenCalledWith("/auth/forgot-password", { identifier: "Some_Handle" });
  expect(container.textContent).toContain(reply);
  act(() => button("Back to log in").click());
  await flush();
  expect(container.querySelector("#auth-username")).not.toBeNull();
});

test("a Google account can add a handle and password, which asks for the email code", async () => {
  const updateUser = jest.fn();
  jest.spyOn(AuthContext, "useAuth").mockReturnValue({ user: { username: "g_user", is_verified: true }, updateUser });
  jest.spyOn(api, "get").mockImplementation((path) =>
    Promise.resolve({
      data: path === "/me/account"
        ? { username: "g_user", email: "g@example.com", has_password: false, providers: ["google"], is_verified: true }
        : {},
    })
  );
  const post = jest.spyOn(api, "post").mockResolvedValue({
    data: { user: { username: "new_handle", is_verified: false }, verification_sent: true },
  });
  act(() => root.render(<AccountSettings />));
  await flush();
  expect(container.textContent).toContain("Add a handle and password");
  expect(container.textContent).not.toContain("Change password");

  type(container.querySelector('input[aria-label="Handle"]'), "new_handle");
  type(container.querySelector('input[aria-label="Password"]'), "Linked1234abc");
  type(container.querySelector('input[aria-label="Repeat password"]'), "Linked1234abc");
  await act(async () => button("Save handle and password").click());
  await flush();
  expect(post).toHaveBeenCalledWith("/me/link-credentials", { username: "new_handle", password: "Linked1234abc" });
  expect(updateUser).toHaveBeenCalledWith({ username: "new_handle", is_verified: false });
  expect(container.textContent).toContain("Check your email for the code");
});

test("the link form refuses a blocked handle before sending anything", async () => {
  jest.spyOn(AuthContext, "useAuth").mockReturnValue({ user: { username: "g_user", is_verified: true }, updateUser: jest.fn() });
  jest.spyOn(api, "get").mockResolvedValue({
    data: { username: "g_user", email: null, has_password: false, providers: ["google"], is_verified: true },
  });
  const post = jest.spyOn(api, "post");
  act(() => root.render(<AccountSettings />));
  await flush();
  type(container.querySelector('input[aria-label="Handle"]'), "fuuuck_you");
  type(container.querySelector('input[aria-label="Password"]'), "Linked1234abc");
  type(container.querySelector('input[aria-label="Repeat password"]'), "Linked1234abc");
  expect(container.textContent).toContain("isn't allowed");
  expect(button("Save handle and password").disabled).toBe(true);
  expect(post).not.toHaveBeenCalled();
});
