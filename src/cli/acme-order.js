#!/usr/bin/env node

const { DefaultAzureCredential } = require('@azure/identity');

const {
  ACME_ACCOUNT_CONTACT,
  ACME_ACCOUNT_TOS_AGREED,
  ACME_DIRECTORY_URL,
  DOMAINS,
  KEY_VAULT_ACME_ACCOUNT_KEY_NAME,
  KEY_VAULT_CERTIFICATE_NAME,
  KEY_VAULT_NAME
} = process.env;

const cli = require('../cli');

(async function acmeOrder() {
  cli.order({
    acmeAccountContact: ACME_ACCOUNT_CONTACT.split(',').map(contact => contact.trim()),
    acmeAccountKeyName: KEY_VAULT_ACME_ACCOUNT_KEY_NAME,
    acmeAccountTermsOfServiceAgreed: !!ACME_ACCOUNT_TOS_AGREED,
    acmeDirectoryURL: ACME_DIRECTORY_URL,
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: KEY_VAULT_NAME,
    domains: DOMAINS.split(',').map(domain => domain.trim()),
    force: true,
    sslCertificateKeyVaultName: KEY_VAULT_CERTIFICATE_NAME
  });
})().catch(err => {
  console.error(err);
  process.exit(-1);
});
