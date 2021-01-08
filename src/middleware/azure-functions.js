const fetchChallengeResponse = require('./fetchChallengeResponse');

module.exports = ({ azureCredential, azureKeyVaultName }) => {
  return async context => {
    let challengeResponse;

    try {
      challengeResponse = await fetchChallengeResponse({ azureCredential, azureKeyVaultName });
    } catch (err) {
      if (err instanceof TypeError) {
        context.res = { status: 400 };

        return;
      }

      context.res = { status: 404 };

      return;
    }

    context.res = { body: challengeResponse };
  };
};
