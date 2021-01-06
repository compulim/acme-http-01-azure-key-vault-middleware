const { KeyClient } = require('@azure/keyvault-keys');
const debug = require('debug')('acme:client');
const fetch = require('node-fetch');

const createAzureKeyVaultURL = require('./util/createAzureKeyVaultURL');
const createThumbprintFromJWK = require('./keyVault/createThumbprintFromJWK');
const lazy = require('./util/lazy');
const signAsFlattenedJWS = require('./keyVault/signAsFlattenedJWS');
const toBase64URL = require('./util/toBase64URL');

class ACMEClient {
  constructor({ acmeAccountKeyName, acmeDirectoryURL, azureCredential, azureKeyVaultName }) {
    const keyVaultURL = createAzureKeyVaultURL(azureKeyVaultName);

    this.azureCredential = azureCredential;
    this.directoryURL = acmeDirectoryURL;
    this.certificateClient = new KeyClient(keyVaultURL, azureCredential);
    this.keyClient = new KeyClient(keyVaultURL, azureCredential);

    this.getKeyVaultKey = lazy(() => this.keyClient.getKey(acmeAccountKeyName));

    this.getDirectory = lazy(async () => {
      const res = await fetch(this.directoryURL);

      if (!res.ok) {
        throw new Error(`server returned ${res.status} while fetching directory`);
      }

      return res.json();
    });

    this.getNextNonce = lazy(async () => {
      const url = (await this.getDirectory()).newNonce;

      const res = await fetch(url, { method: 'HEAD' });

      if (!res.ok) {
        throw new Error(`directory server return ${res.status} while getting a new nonce`);
      }

      return res.headers.get('replay-nonce');
    });
  }

  async newAccount({ contact, termsOfServiceAgreed, onlyReturnExisting, externalAccountBinding }) {
    const payload = {
      contact,
      termsOfServiceAgreed,
      onlyReturnExisting,
      externalAccountBinding
    };

    debug('creating or signing into account', payload);

    const { location, result } = await this.post((await this.getDirectory()).newAccount, payload);

    debug(`account created`, { location, result });

    this.keyId = location;

    return result;
  }

  async newOrder({ identifiers, notAfter, notBefore }) {
    const payload = {
      identifiers: (identifiers || []).map(({ type, value }) => ({ type, value })),
      notBefore,
      notAfter
    };

    debug(`creating a new order`, { payload });

    const { location, result } = await this.post((await this.getDirectory()).newOrder, payload);

    debug(`order created`, { location, result });

    return { _location: location, ...result };
  }

  async authorize(url) {
    const { result } = await this.get(url);

    return result;
  }

  async finalize(url, csr) {
    const payload = { csr: toBase64URL(csr) };

    debug(`finalizing an order`, { payload });

    const { result } = await this.post(url, payload);

    return result;
  }

  async downloadCertificate(url) {
    const { result } = await this.get(url);

    return result;
  }

  async prepareHTTP01ChallengeResponse(token) {
    const keyVaultKey = await this.getKeyVaultKey();
    const thumbprint = await createThumbprintFromJWK(keyVaultKey);

    return `${token}.${toBase64URL(thumbprint)}`;
  }

  async getOrder(orderURL) {
    const { result } = await this.get(orderURL);

    return result;
  }

  get(url) {
    return this.post(url, '');
  }

  async post(url, payload = {}) {
    const body = await signAsFlattenedJWS(
      this.azureCredential,
      await this.getKeyVaultKey(),
      this.keyId,
      {
        nonce: await this.getNextNonce(),
        url
      },
      payload
    );

    const res = await fetch(url, { body, headers: { 'content-type': 'application/jose+json' }, method: 'POST' });

    if (!res.ok) {
      debug(`failed to POST to ${url}`, await res.text());

      throw new Error(`directory returned ${res.status}`);
    }

    const replayNonce = res.headers.get('replay-nonce');

    this.getNextNonce = () => replayNonce;

    const contentType = res.headers.get('content-type');
    const location = res.headers.get('location');

    if (contentType === 'application/pem-certificate-chain') {
      return { location, result: await res.buffer() };
    }

    return { location, result: await res.json() };
  }
}

module.exports = ACMEClient;
