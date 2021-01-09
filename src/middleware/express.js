const { BurstyRateLimiter, RateLimiterMemory } = require('rate-limiter-flexible');
const { Router } = require('express');
const debug = require('debug')('acme:middleware');

const fetchChallengeResponse = require('./fetchChallengeResponse');

const DEFAULT_RATE_LIMITER = new BurstyRateLimiter(
  new RateLimiterMemory({
    duration: 300,
    points: 100
  }),
  new RateLimiterMemory({
    duration: 1,
    points: 50
  })
);

module.exports = ({ azureCredential, azureKeyVaultName, rateLimiter = DEFAULT_RATE_LIMITER }) => {
  debug(`created using Azure Key Vault "${azureKeyVaultName}", will retrieve HTTP-01 challenge response from secrets.`);

  const router = new Router();

  router.get('/.well-known/acme-challenge/:token', async (req, res, next) => {
    try {
      rateLimiter && (await rateLimiter.consume());
    } catch (err) {
      return res.status(429).end();
    }

    let challengeResponse;

    try {
      challengeResponse = await fetchChallengeResponse({ azureCredential, azureKeyVaultName, token: req.params.token });
    } catch (err) {
      debug(`failed to get challenge response`, err);

      if (err instanceof TypeError) {
        return res.status(400).end();
      }

      return res.status(404).end();
    }

    res.send(challengeResponse).end();
  });

  return router;
};
