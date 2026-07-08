import "dotenv/config";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { z } from "zod";

/**
 * Direct connection to an SAP B1 Service Layer instance (no BTP Destination
 * Service in this deployment). Credentials come from environment variables
 * only -- never hardcode them here.
 */
const configSchema = z.object({
  baseUrl: z.string().url(),
  companyDB: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type B1Config = z.infer<typeof configSchema>;

export function loadB1Config(): B1Config {
  const raw = {
    baseUrl: process.env.B1_SERVICE_LAYER_URL,
    companyDB: process.env.B1_COMPANY_DB,
    username: process.env.B1_USERNAME,
    password: process.env.B1_PASSWORD,
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid SAP B1 Service Layer configuration: ${result.error.message}`
    );
  }
  return result.data;
}

interface LoginResponse {
  SessionId: string;
  Version: string;
  SessionTimeout: number;
}

/**
 * Manages a Service Layer login session (B1SESSION cookie). Service Layer
 * uses cookie-based sessions rather than bearer tokens, so we track and
 * resend the Set-Cookie value ourselves and re-login transparently on 401.
 */
export class B1Session {
  private readonly http: AxiosInstance;
  private readonly config: B1Config;
  private readonly basePathname: string;
  private cookie: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(config: B1Config = loadB1Config()) {
    this.config = config;
    this.basePathname = new URL(config.baseUrl).pathname;
    this.http = axios.create({
      baseURL: config.baseUrl,
      validateStatus: () => true,
      timeout: 30000,
    });
  }

  /**
   * Most Service Layer @odata.nextLink values are relative to the service
   * root (e.g. "BusinessPartners?$skip=20"), which combines cleanly with our
   * baseURL. But $crossjoin nextLinks come back server-root-relative
   * (e.g. "/b1s/v2/$crossjoin(...)&$skip=20"), which already includes the
   * service path -- combined with baseURL as-is it duplicates that path
   * segment ("/b1s/v2/b1s/v2/..."). Strip the known base path so both
   * shapes resolve to the same place.
   */
  private normalizePath(path: string): string {
    if (path.startsWith(this.basePathname)) {
      return path.slice(this.basePathname.length);
    }
    return path;
  }

  private async login(): Promise<void> {
    const response = await this.http.post<LoginResponse>("Login", {
      CompanyDB: this.config.companyDB,
      UserName: this.config.username,
      Password: this.config.password,
    });

    if (response.status !== 200) {
      throw new Error(
        `SAP B1 Service Layer login failed (${response.status}): ${JSON.stringify(
          response.data
        )}`
      );
    }

    const setCookie = response.headers["set-cookie"];
    if (!setCookie || setCookie.length === 0) {
      throw new Error("SAP B1 Service Layer login succeeded but returned no session cookie");
    }
    this.cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }

  private async ensureSession(): Promise<void> {
    if (this.cookie) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  /** GET a Service Layer resource, re-authenticating once if the session expired. */
  async get<T = unknown>(rawPath: string, params?: AxiosRequestConfig["params"]): Promise<T> {
    await this.ensureSession();

    const path = this.normalizePath(rawPath);
    const doRequest = () =>
      this.http.get<T>(path, {
        params,
        headers: { Cookie: this.cookie ?? "" },
      });

    let response = await doRequest();

    if (response.status === 401) {
      this.cookie = null;
      await this.ensureSession();
      response = await doRequest();
    }

    if (response.status !== 200) {
      throw new Error(
        `SAP B1 Service Layer request to ${path} failed (${response.status}): ${JSON.stringify(
          response.data
        )}`
      );
    }

    return response.data;
  }

  async logout(): Promise<void> {
    if (!this.cookie) return;
    await this.http.post("Logout", null, { headers: { Cookie: this.cookie } });
    this.cookie = null;
  }
}
