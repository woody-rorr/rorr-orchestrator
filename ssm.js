import { SSMClient, GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({ region: process.env.AWS_REGION || "us-east-1" });

const cache = new Map(); // name → { value, expires }
const TTL_MS = 60_000;

export async function getSsm(name, { decrypt = true, cached = true } = {}) {
  if (cached) {
    const hit = cache.get(name);
    if (hit && hit.expires > Date.now()) return hit.value;
  }
  try {
    const r = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: decrypt }));
    const value = r.Parameter?.Value ?? null;
    cache.set(name, { value, expires: Date.now() + TTL_MS });
    return value;
  } catch (e) {
    if (e.name === "ParameterNotFound") return null;
    throw e;
  }
}

export async function putSsm(name, value, { secure = true } = {}) {
  await ssm.send(new PutParameterCommand({
    Name: name,
    Value: value,
    Type: secure ? "SecureString" : "String",
    Overwrite: true,
  }));
  cache.delete(name);
}
