// عميل App Store Connect بلا اعتماديات — توقيع ES256 بوحدة crypto في Node
// (سكربتات بايثون السابقة ضاعت مع مسح /tmp؛ هذه لا تحتاج pip ولا venv)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const KID = 'R7MPB9GF3A';
const ISS = '8c4bcb1e-fbcb-42f0-860e-ba398aa5865d';
export const APP = '6803916623';
const API = 'https://api.appstoreconnect.apple.com/v1';
const key = fs.readFileSync(`${os.homedir()}/.asc/AuthKey_${KID}.p8`);

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: KID, typ: 'JWT' });
  const body = b64({ iss: ISS, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  // ieee-p1363 = r||s الخام الذي يطلبه ES256 (وليس DER)
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

export async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
