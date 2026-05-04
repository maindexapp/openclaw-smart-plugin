import { randomBytes, createHash } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CALLBACK_PORT = 18821;
const CALLBACK_PATH = "/oauth/callback";
const TOKEN_FILE_DIR = join(homedir(), ".openclaw", "plugins", "maindex");
const TOKEN_FILE = join(TOKEN_FILE_DIR, "tokens.json");

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface OAuthDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function discoverOAuth(baseUrl: string): Promise<OAuthDiscovery> {
  const resourceUrl = new URL(
    "/.well-known/oauth-protected-resource",
    baseUrl
  );
  const resourceRes = await fetch(resourceUrl.href);
  if (!resourceRes.ok) {
    throw new Error(
      `OAuth resource discovery failed: ${resourceRes.status} ${resourceRes.statusText}`
    );
  }
  const resourceMeta = (await resourceRes.json()) as {
    authorization_servers?: string[];
  };
  const authServer = resourceMeta.authorization_servers?.[0];
  if (!authServer) {
    throw new Error("No authorization_servers in OAuth resource metadata");
  }

  const authMetaUrl = new URL(
    "/.well-known/oauth-authorization-server",
    authServer
  );
  const authMetaRes = await fetch(authMetaUrl.href);
  if (!authMetaRes.ok) {
    throw new Error(
      `OAuth auth server discovery failed: ${authMetaRes.status} ${authMetaRes.statusText}`
    );
  }
  return (await authMetaRes.json()) as OAuthDiscovery;
}

async function dynamicClientRegistration(
  registrationEndpoint: string,
  redirectUri: string
): Promise<{ clientId: string; clientSecret?: string }> {
  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Maindex OpenClaw Plugin",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Dynamic client registration failed: ${res.status} ${res.statusText}`
    );
  }
  const data = (await res.json()) as {
    client_id: string;
    client_secret?: string;
  };
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

function waitForCallback(
  state: string
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Authentication failed</h2><p>You can close this window.</p></body></html>"
        );
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Invalid callback</h2><p>Missing code or state mismatch.</p></body></html>"
        );
        server.close();
        reject(new Error("Invalid OAuth callback: missing code or bad state"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body><h2>Authenticated with Maindex</h2><p>You can close this window and return to OpenClaw.</p></body></html>"
      );
      server.close();
      resolve({ code, state: returnedState });
    });

    server.listen(CALLBACK_PORT, "127.0.0.1");

    server.on("error", (err) => {
      reject(
        new Error(`Failed to start OAuth callback server on port ${CALLBACK_PORT}: ${err.message}`)
      );
    });

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timed out after 120 seconds"));
    }, 120_000);
  });
}

async function exchangeCode(
  tokenEndpoint: string,
  code: string,
  redirectUri: string,
  clientId: string,
  codeVerifier: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Token exchange failed: ${res.status} ${res.statusText} — ${text}`
    );
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

async function refreshAccessToken(
  tokenEndpoint: string,
  clientId: string,
  refreshToken: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

export async function loadStoredTokens(): Promise<OAuthTokens | null> {
  try {
    const raw = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(raw) as OAuthTokens;
  } catch {
    return null;
  }
}

async function storeTokens(tokens: OAuthTokens): Promise<void> {
  await mkdir(TOKEN_FILE_DIR, { recursive: true });
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

export async function authenticate(
  baseUrl: string,
  openBrowser: (url: string) => void
): Promise<OAuthTokens> {
  const discovery = await discoverOAuth(baseUrl);
  const redirectUri = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;

  let clientId: string;
  if (discovery.registration_endpoint) {
    const reg = await dynamicClientRegistration(
      discovery.registration_endpoint,
      redirectUri
    );
    clientId = reg.clientId;
  } else {
    throw new Error(
      "OAuth server does not support dynamic client registration; " +
        "configure an API key instead (authMode: apiKey)"
    );
  }

  const { verifier, challenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  openBrowser(authUrl.href);

  const { code } = await waitForCallback(state);
  const tokens = await exchangeCode(
    discovery.token_endpoint,
    code,
    redirectUri,
    clientId,
    verifier
  );
  await storeTokens(tokens);
  return tokens;
}

export async function getValidToken(
  baseUrl: string,
  openBrowser: (url: string) => void
): Promise<string> {
  let tokens = await loadStoredTokens();

  if (tokens && tokens.expiresAt && tokens.expiresAt < Date.now() + 60_000) {
    if (tokens.refreshToken) {
      try {
        const discovery = await discoverOAuth(baseUrl);
        tokens = await refreshAccessToken(
          discovery.token_endpoint,
          "maindex-openclaw",
          tokens.refreshToken
        );
        await storeTokens(tokens);
      } catch {
        tokens = null;
      }
    } else {
      tokens = null;
    }
  }

  if (!tokens) {
    tokens = await authenticate(baseUrl, openBrowser);
  }

  return tokens.accessToken;
}
