const { SecretClient } = require('@azure/keyvault-secrets');
const debug = require('debug')('acme:middleware');

const createAzureKeyVaultURL = require('../util/createAzureKeyVaultURL');
const createChallengeSecretName = require('../util/createChallengeSecretName');

const BASE64URL_PATTERN = /^[A-Za-z0-9-_]+$/u;

module.exports = async function fetchChallengeResponse({ azureCredential, azureKeyVaultName, token }) {
  if (!azureCredential) {
    throw new TypeError('"azureCredential" must be specified');
  } else if (!azureKeyVaultName) {
    throw new TypeError('"azureKeyVaultName" must be specified');
  } else if (!BASE64URL_PATTERN.test(token)) {
    throw new TypeError(`"token" is not a valid ACME challenge`);
  }

  const secretClient = new SecretClient(createAzureKeyVaultURL(azureKeyVaultName), azureCredential);

  debug(`received an ACME challenge for token "${token}"`);

  let challengeResponse;

  try {
    const { value } = await secretClient.getSecret(createChallengeSecretName(token));

    challengeResponse = value;
  } catch (err) {
    if (err.code === 'SecretNotFound') {
      const error = new Error('ACME challenge not found');

      error.code = 'ENOENT';

      throw error;
    }

    const error = new Error('Failed to get ACME challenge from Azure Key Vault');

    error.code = 'EACCES';

    throw err;
  }

  return challengeResponse;
};
