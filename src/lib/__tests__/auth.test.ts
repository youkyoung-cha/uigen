// @vitest-environment node
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const cookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  cookieStore.set.mockReset();
  cookieStore.get.mockReset();
  cookieStore.delete.mockReset();
  process.env.JWT_SECRET = "test-secret-for-unit-tests";
  process.env.NODE_ENV = "test";
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("createSession sets an auth-token cookie with a signed JWT", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "alice@example.com");

  expect(cookieStore.set).toHaveBeenCalledTimes(1);
  const [name, token, options] = cookieStore.set.mock.calls[0];

  expect(name).toBe("auth-token");
  expect(typeof token).toBe("string");
  expect(token.split(".")).toHaveLength(3);

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("alice@example.com");
  expect(typeof payload.exp).toBe("number");

  expect(options).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  expect(options.expires).toBeInstanceOf(Date);
});

test("createSession uses a ~7-day expiry on both the JWT and the cookie", async () => {
  const { createSession } = await import("@/lib/auth");
  const before = Date.now();

  await createSession("user-456", "bob@example.com");

  const after = Date.now();
  const [, token, options] = cookieStore.set.mock.calls[0];

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cookieExpiresMs = (options.expires as Date).getTime();
  expect(cookieExpiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(cookieExpiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  const expMs = (payload.exp as number) * 1000;
  expect(expMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("createSession sets secure cookie in production", async () => {
  process.env.NODE_ENV = "production";
  const { createSession } = await import("@/lib/auth");

  await createSession("user-789", "carol@example.com");

  const [, , options] = cookieStore.set.mock.calls[0];
  expect(options.secure).toBe(true);
});

test("createSession does not set secure cookie outside production", async () => {
  process.env.NODE_ENV = "development";
  const { createSession } = await import("@/lib/auth");

  await createSession("user-000", "dave@example.com");

  const [, , options] = cookieStore.set.mock.calls[0];
  expect(options.secure).toBe(false);
});

test("createSession produces a token that getSession can round-trip", async () => {
  const { createSession, getSession } = await import("@/lib/auth");

  await createSession("user-xyz", "eve@example.com");
  const [, token] = cookieStore.set.mock.calls[0];
  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-xyz");
  expect(session?.email).toBe("eve@example.com");
});

test("createSession falls back to development secret when JWT_SECRET is unset", async () => {
  delete process.env.JWT_SECRET;
  const { createSession } = await import("@/lib/auth");

  await createSession("user-fallback", "frank@example.com");

  const [, token] = cookieStore.set.mock.calls[0];
  const secret = new TextEncoder().encode("development-secret-key");
  const { payload } = await jwtVerify(token, secret);
  expect(payload.userId).toBe("user-fallback");
});

async function signToken(
  payload: Record<string, unknown>,
  secretString: string,
  expirationTime: string | number = "7d"
) {
  const secret = new TextEncoder().encode(secretString);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(secret);
}

test("getSession returns null when no auth-token cookie is set", async () => {
  const { getSession } = await import("@/lib/auth");
  cookieStore.get.mockReturnValue(undefined);

  const session = await getSession();

  expect(session).toBeNull();
  expect(cookieStore.get).toHaveBeenCalledWith("auth-token");
});

test("getSession returns null when the cookie exists but has no value", async () => {
  const { getSession } = await import("@/lib/auth");
  cookieStore.get.mockReturnValue({ value: undefined });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns the decoded payload for a valid token", async () => {
  const { getSession } = await import("@/lib/auth");
  const token = await signToken(
    { userId: "user-abc", email: "alice@example.com" },
    process.env.JWT_SECRET!
  );
  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-abc");
  expect(session?.email).toBe("alice@example.com");
});

test("getSession returns null when the token is malformed", async () => {
  const { getSession } = await import("@/lib/auth");
  cookieStore.get.mockReturnValue({ value: "not-a-real-jwt" });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null when the token is signed with the wrong secret", async () => {
  const { getSession } = await import("@/lib/auth");
  const token = await signToken(
    { userId: "user-mismatch", email: "bob@example.com" },
    "a-completely-different-secret"
  );
  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null when the token is expired", async () => {
  const { getSession } = await import("@/lib/auth");
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const pastSeconds = Math.floor(Date.now() / 1000) - 60;
  const token = await new SignJWT({
    userId: "user-expired",
    email: "carol@example.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(pastSeconds - 3600)
    .setExpirationTime(pastSeconds)
    .sign(secret);
  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession falls back to the development secret when JWT_SECRET is unset", async () => {
  delete process.env.JWT_SECRET;
  const { getSession } = await import("@/lib/auth");
  const token = await signToken(
    { userId: "user-dev", email: "dev@example.com" },
    "development-secret-key"
  );
  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session?.userId).toBe("user-dev");
  expect(session?.email).toBe("dev@example.com");
});
