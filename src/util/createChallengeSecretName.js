// Names used in Azure Key Vault does not support underscores, which is required by Base64 URL.
// We are turning underscores into "--", which should not have a significant impact on collision.
// We could change Base64 URL into hex, but it hurts debugging.
module.exports = function createChallengeSecretName(token) {
  return `acme-http-01-challenge-${token.replace(/_/gu, '--')}`;
};
