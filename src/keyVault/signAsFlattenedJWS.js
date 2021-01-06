const { CryptographyClient } = require('@azure/keyvault-keys');
const crypto = require('crypto');

const toBase64URL = require('../util/toBase64URL');

module.exports = async function signAsFlattenedJWS(credential, keyVaultKey, keyId, protectedHeaders, payload) {
  const base64URLPayload = payload ? toBase64URL(JSON.stringify(payload)) : '';

  const { key } = keyVaultKey;
  const jwk = {
    ...key,
    x: toBase64URL(key.x),
    y: toBase64URL(key.y)
  };

  protectedHeaders = JSON.stringify({
    alg: 'ES256',
    ...(keyId ? { kid: keyId } : { jwk }),
    ...protectedHeaders
  });

  const base64URLProtectedHeaders = toBase64URL(protectedHeaders);

  const hash = crypto.createHash('sha256');
  const digest = hash.update(base64URLProtectedHeaders + '.' + base64URLPayload).digest();

  const cryptographyClient = new CryptographyClient(keyVaultKey, credential);

  const signature = toBase64URL((await cryptographyClient.sign('ES256', digest)).result);

  return JSON.stringify({
    protected: base64URLProtectedHeaders,
    payload: base64URLPayload,
    signature
  });
};
