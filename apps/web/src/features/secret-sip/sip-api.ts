import { apiGet, apiPost } from "../../lib/api-client.js";
import type { SipIdentity } from "./sip-contract.js";

const memory = new Map<string, SipIdentity>();
export const loadSipIdentity = (code: string): SipIdentity | null => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(`secret-sip:${code}`) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "code" in value &&
      value.code === code &&
      "token" in value &&
      typeof value.token === "string" &&
      /^[a-f0-9]{64}$/.test(value.token)
    )
      return { code, token: value.token };
  } catch {
    /* Private browsing can disable storage; the open tab still works. */
  }
  return memory.get(code) ?? null;
};
export const saveSipIdentity = (identity: SipIdentity) => {
  memory.set(identity.code, identity);
  try {
    sessionStorage.setItem(`secret-sip:${identity.code}`, JSON.stringify(identity));
  } catch {
    /* Keep the in-memory identity. */
  }
};
export const forgetSipIdentity = (code: string) => {
  memory.delete(code);
  try {
    sessionStorage.removeItem(`secret-sip:${code}`);
  } catch {
    /* Storage is optional. */
  }
};
export const createSipRoom = async () =>
  (await apiPost<SipIdentity, object>("/api/sip/rooms", {})).data;
export const joinSipRoom = async (code: string) =>
  (await apiPost<SipIdentity, object>(`/api/sip/rooms/${code}/join`, {})).data;
export const pingSip = async (signal: AbortSignal) =>
  apiGet<{ enabled: boolean }>("/api/sip/health", signal);
