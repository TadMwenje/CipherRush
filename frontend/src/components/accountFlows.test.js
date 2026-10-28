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
  act(() => button("Forgot password?").click());
  type(container.querySelector("#auth-forgot"), " Some_Handle ");
  await act(async () => button("Email me a link").click());
  await flush();
  expect(post).toHaveBeenCalledWith("/auth/forgot-password", { identifier: "Some_Handle" });
  expect(container.textContent).toContain(reply);
  act(() => button("Back to log in").click());
  expect(container.querySelector("#auth-username")).not.toBeNull();
});
