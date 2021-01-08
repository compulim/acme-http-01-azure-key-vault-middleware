const { CertificateClient } = require('@azure/keyvault-certificates');
const { SecretClient } = require('@azure/keyvault-secrets');
const debug = require('debug')('acme:cli');
const forge = require('node-forge');

const ACMEClient = require('./ACMEClient');
const createAzureKeyVaultURL = require('../util/createAzureKeyVaultURL');
const createCertificationRequest = require('../util/createCertificationRequest');
const createChallengeSecretName = require('../util/createChallengeSecretName');
const fromBase64URL = require('../util/fromBase64URL');

const CHECK_ORDER_LOOP = 5;
const CHECK_ORDER_INTERVAL = 1000;
const LETS_ENCRYPT_STAGING_DIRECTORY_URL = 'https://acme-staging-v02.api.letsencrypt.org/directory';

async function order({
  acmeAccountContacts,
  acmeAccountKeyName,
  acmeAccountTermsOfServiceAgreed,
  acmeDirectoryURL = LETS_ENCRYPT_STAGING_DIRECTORY_URL,
  azureCredential,
  azureKeyVaultName,
  domains,
  sslCertificateKeyVaultName
}) {
  if (!acmeAccountContacts) {
    throw new Error('"acmeAccountContacts" must be specified');
  } else if (!acmeAccountKeyName) {
    throw new Error('"acmeAccountKeyName" must be specified');
  } else if (!acmeAccountTermsOfServiceAgreed) {
    throw new Error('"acmeAccountTermsOfServiceAgreed" must be specified');
  } else if (!azureCredential) {
    throw new Error('"azureCredential" must be specified');
  } else if (!azureKeyVaultName) {
    throw new Error('"azureKeyVaultName" must be specified');
  } else if (!domains) {
    throw new Error('"domains" must be specified');
  } else if (!sslCertificateKeyVaultName) {
    throw new Error('"sslCertificateKeyVaultName" must be specified');
  }

  debug(`creating a new ACME account or signing into existing one`);

  const acmeClient = new ACMEClient({
    acmeAccountKeyName,
    acmeDirectoryURL,
    azureCredential,
    azureKeyVaultName
  });

  console.log('Creating or signing into ACME provider.');

  try {
    await acmeClient.newAccount({
      contact: acmeAccountContacts,
      termsOfServiceAgreed: acmeAccountTermsOfServiceAgreed
    });
  } catch (err) {
    console.error(`Failed to create a new account or sign into existing one.`);

    throw err;
  }

  let orderResult;

  console.log('Creating a new certificate order.');

  try {
    orderResult = await acmeClient.newOrder({
      identifiers: domains.map(domain => ({ type: 'dns', value: domain.trim() }))
    });
  } catch (err) {
    console.error(`Failed to create a new order`);

    throw err;
  }

  const { _location: orderURL, authorizations, expires, finalize: finalizeURL, status: orderStatus } = orderResult;

  debug(`new order opened`, orderResult);

  console.log(`Order created at ${orderURL}.`);

  let orderReady = orderStatus === 'ready';

  if (orderStatus !== 'ready') {
    console.log(`Preparing HTTP-01 challenge responses.`);

    const secretClient = new SecretClient(createAzureKeyVaultURL(azureKeyVaultName), azureCredential);

    // Since anti-replay nonce will block when reusing a nonce, we cannot use Promise.all to parallel the call.

    for (let authorizationURL of authorizations) {
      let authorizeResult;

      try {
        authorizeResult = await acmeClient.authorize(authorizationURL);
      } catch (err) {
        console.error(`Failed to get authorization information from ${authorizationURL}.`);

        throw err;
      }

      const { challenges, identifier } = authorizeResult;
      const http01Challenge = challenges.find(({ type }) => type === 'http-01');

      if (!http01Challenge) {
        throw new Error('No HTTP-01 challenge found, ACME server must support HTTP-01 challenges');
      }

      debug(`got HTTP-01 challenge for ${identifier.type}:${identifier.value}`, {
        authorizationURL,
        http01Challenge,
        identifier
      });

      const { token } = http01Challenge;

      const challengeResponse = await acmeClient.prepareHTTP01ChallengeResponse(token);

      try {
        await secretClient.setSecret(createChallengeSecretName(token), challengeResponse, {
          expiresOn: new Date(expires)
        });
      } catch (err) {
        console.error(`Failed to upload HTTP-01 challenge response to Azure Key Vault as a secret.`);

        throw err;
      }

      debug(`signaling readiness for HTTP-01 challenge`);

      try {
        await acmeClient.post(http01Challenge.url);
      } catch (err) {
        console.error(`Failed to send HTTP-01 challenge acceptance.`);

        throw err;
      }
    }
  }

  if (!orderReady) {
    console.log('Waiting for order to become ready.');

    for (let i = 0; i < CHECK_ORDER_LOOP; i++) {
      await new Promise(resolve => setTimeout(resolve, CHECK_ORDER_INTERVAL));

      debug('checking order status');

      let orderResult;

      try {
        orderResult = await acmeClient.getOrder(orderURL);
      } catch (err) {
        console.error(`Failed to get order status for order ${orderURL}`);

        throw err;
      }

      debug('order status', orderResult);

      if (orderResult.status === 'ready') {
        orderReady = true;

        break;
      }
    }
  }

  if (!orderReady) {
    console.log('Order is not ready after retries. Please check if web server is responding HTTP-01 correctly.');

    throw new Error('order is not ready');
  }

  console.log(`Order is ready for pickup (finalize) at ${finalizeURL}.`);

  debug('creating certificate signing request');

  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const certificationRequest = await createCertificationRequest(keyPair, domains);

  debug(`finalizing order`, { finalizeURL });

  let finalizeResult;

  try {
    finalizeResult = await acmeClient.finalize(finalizeURL, certificationRequest);
  } catch (err) {
    console.error(`Failed to finalize order at ${finalizeURL}`);

    throw err;
  }

  const { certificate: certificateURL, status: finalizeStatus } = finalizeResult;

  if (finalizeStatus !== 'valid') {
    console.error(`Received invalid finalize response with status "${finalizeStatus}".`);

    throw new Error(`invalid finalize response`);
  }

  console.log(`Downloading certificate from ${certificateURL}.`);

  const certificateInPEM = await acmeClient.downloadCertificate(certificateURL);
  const certificate = forge.pki.certificateFromPem(certificateInPEM);

  console.log(
    `Certificate downloaded, serial number is ${
      certificate.serialNumber
    } and will expires at ${certificate.validity.notAfter.toISOString()}.`
  );

  debug(`certificate downloaded, archiving to PKCS #12 with private key`, certificate);

  const pkcs12InASN1 = forge.pkcs12.toPkcs12Asn1(keyPair.privateKey, certificate, '');
  const pkcs12InDER = forge.asn1.toDer(pkcs12InASN1).getBytes();
  const pkcs12 = fromBase64URL(forge.util.encode64(pkcs12InDER));

  const certificateClient = new CertificateClient(createAzureKeyVaultURL(azureKeyVaultName), azureCredential);

  console.log(`Uploading certificate to Azure Key Vault as "${sslCertificateKeyVaultName}".`);

  try {
    await certificateClient.importCertificate(sslCertificateKeyVaultName, pkcs12);
  } catch (err) {
    console.error(`Failed to upload certificate to Azure Key Vault.`);

    throw err;
  }

  console.log(`Certificate uploaded to Azure Key Vault as "${sslCertificateKeyVaultName}".`);
}

module.exports = { order };
