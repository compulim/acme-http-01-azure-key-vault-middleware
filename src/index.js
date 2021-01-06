const { RateLimiterMemory } = require('rate-limiter-flexible');
const { Router } = require('express');
const { SecretClient } = require('@azure/keyvault-secrets');
const debug = require('debug')('acme:middleware');

const createChallengeSecretName = require('./util/createChallengeSecretName');
const createAzureKeyVaultURL = require('./util/createAzureKeyVaultURL');

const BASE64URL_PATTERN = /^[A-Za-z0-9-_]+$/u;

const DEFAULT_RATE_LIMITER = new RateLimiterMemory({
  duration: 1,
  points: 10
});

module.exports = ({ azureCredential, azureKeyVaultName, rateLimiter = DEFAULT_RATE_LIMITER }) => {
  debug(`created using Azure Key Vault "${azureKeyVaultName}", will retrieve HTTP-01 challenge response from secrets.`);

  const router = new Router();
  const secretClient = new SecretClient(createAzureKeyVaultURL(azureKeyVaultName), azureCredential);

  router.get('/.well-known/acme-challenge/:token', async (req, res, next) => {
    try {
      rateLimiter && (await rateLimiter.consume());
    } catch (err) {
      return res.status(429).end();
    }

    const token = req.params.token;

    if (!BASE64URL_PATTERN.test(token)) {
      debug(`received an invalid ACME challenge with token "${token}"`);

      return next(req, res);
    }

    debug(`received an ACME challenge for token "${token}"`);

    let challengeResponse;

    try {
      const { value } = await secretClient.getSecret(createChallengeSecretName(token));

      challengeResponse = value;
    } catch (err) {
      if (err.code === 'SecretNotFound') {
        debug(`ACME challenge respond for token "${token}" was not found in Azure Key Vault`);

        return res.status(404).end();
      }

      console.error(`Failed to get ACME challenge from Azure Key Vault`, err);

      res.status(404).end();
    }

    res.send(challengeResponse).end();
  });

  return router;
};
