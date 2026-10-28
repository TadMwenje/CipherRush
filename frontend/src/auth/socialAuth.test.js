import api from "../api";
import { availableProviders, signInWithGoogleNative, SOCIAL_CONFIG } from "./socialAuth";

jest.mock("../api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const IOS_ID = "ios-client.apps.googleusercontent.com";
const WEB_ID = "web-client.apps.googleusercontent.com";

function asPlatform(name) {
  window.Capacitor =
    name === "web"
      ? undefined
      : { isNativePlatform: () => true, getPlatform: () => name, Plugins: { SocialLogin: {} } };
}

beforeEach(() => {
  api.get.mockResolvedValue({ data: { google: true, apple: true } });
  Object.assign(SOCIAL_CONFIG, { googleWebClientId: "", googleIosClientId: "", appleServiceId: "", appleRedirectUri: "" });
});

afterAll(() => {
  delete window.Capacitor;
});

test("iOS shows Google with only the iOS client ID, and always shows Apple", async () => {
  asPlatform("ios");
  SOCIAL_CONFIG.googleIosClientId = IOS_ID;
  expect(await availableProviders()).toEqual({ google: true, apple: true });
});

test("iOS hides Google without an iOS client ID", async () => {
  asPlatform("ios");
  SOCIAL_CONFIG.googleWebClientId = WEB_ID;
  expect((await availableProviders()).google).toBe(false);
});

test("Android needs the Web client ID for Google and never shows Apple", async () => {
  asPlatform("android");
  SOCIAL_CONFIG.googleIosClientId = IOS_ID;
  expect(await availableProviders()).toEqual({ google: false, apple: false });
  SOCIAL_CONFIG.googleWebClientId = WEB_ID;
  expect(await availableProviders()).toEqual({ google: true, apple: false });
});

test("nothing shows when the server has the provider switched off", async () => {
  asPlatform("ios");
  SOCIAL_CONFIG.googleIosClientId = IOS_ID;
  api.get.mockResolvedValue({ data: { google: false, apple: false } });
  expect(await availableProviders()).toEqual({ google: false, apple: false });
});

test("nothing shows when the server can't be reached", async () => {
  asPlatform("ios");
  SOCIAL_CONFIG.googleIosClientId = IOS_ID;
  api.get.mockRejectedValue(new Error("offline"));
  expect(await availableProviders()).toEqual({ google: false, apple: false });
});

test("Android Google sign-in sends no scopes (the plugin rejects them); iOS does", async () => {
  // jsdom has no Web Crypto; Node's is the same API.
  Object.defineProperty(window, "crypto", { value: require("crypto").webcrypto, configurable: true });
  const login = jest.fn().mockResolvedValue({ result: { idToken: "id-token" } });
  api.post.mockResolvedValue({ data: { user: {} } });
  asPlatform("android");
  window.Capacitor.Plugins.SocialLogin = { initialize: jest.fn().mockResolvedValue(), login };
  await signInWithGoogleNative();
  expect(login.mock.calls[0][0].options.scopes).toBeUndefined();
  expect(login.mock.calls[0][0].options.nonce).toBeTruthy();

  asPlatform("ios");
  window.Capacitor.Plugins.SocialLogin = { initialize: jest.fn().mockResolvedValue(), login };
  await signInWithGoogleNative();
  expect(login.mock.calls[1][0].options.scopes).toEqual(["email", "profile"]);
});
