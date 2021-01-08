const crypto = require('crypto');

const toBase64URL = require('../../util/toBase64URL');

module.exports = async function createThumbprintFromJWK(keyVaultKey) {
  const { key } = keyVaultKey;
  const hash = crypto.createHash('sha256');

  return hash
    .update(
      new TextEncoder().encode(
        JSON.stringify({
          crv: key.crv,
          kty: key.kty,
          x: toBase64URL(key.x),
          y: toBase64URL(key.y)
        })
      )
    )
    .digest();
};
