#!/usr/bin/env node

const { DefaultAzureCredential } = require('@azure/identity');

const {
  ACME_ACCOUNT_CONTACTS,
  ACME_ACCOUNT_TOS_AGREED,
  ACME_DIRECTORY_URL,
  DOMAINS,
  KEY_VAULT_ACME_ACCOUNT_KEY_NAME,
  KEY_VAULT_CERTIFICATE_NAME,
  KEY_VAULT_NAME
} = process.env;

const cli = require('../cli/index');

(async function order() {
  if (!ACME_ACCOUNT_CONTACTS) {
    throw new Error('Environment variable "ACME_ACCOUNT_CONTACTS" must be set');
  } else if (!ACME_ACCOUNT_TOS_AGREED) {
    throw new Error('Environment variable "ACME_ACCOUNT_TOS_AGREED" must be set');
  } else if (!ACME_DIRECTORY_URL) {
    throw new Error('Environment variable "ACME_DIRECTORY_URL" must be set');
  } else if (!DOMAINS) {
    throw new Error('Environment variable "DOMAINS" must be set');
  } else if (!KEY_VAULT_ACME_ACCOUNT_KEY_NAME) {
    throw new Error('Environment variable "KEY_VAULT_ACME_ACCOUNT_KEY_NAME" must be set');
  } else if (!KEY_VAULT_CERTIFICATE_NAME) {
    throw new Error('Environment variable "KEY_VAULT_CERTIFICATE_NAME" must be set');
  } else if (!KEY_VAULT_NAME) {
    throw new Error('Environment variable "KEY_VAULT_NAME" must be set');
  }

  cli.order({
    acmeAccountContacts: ACME_ACCOUNT_CONTACTS.split(',').map(contact => contact.trim()),
    acmeAccountKeyName: KEY_VAULT_ACME_ACCOUNT_KEY_NAME,
    acmeAccountTermsOfServiceAgreed: !!ACME_ACCOUNT_TOS_AGREED,
    acmeDirectoryURL: ACME_DIRECTORY_URL,
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: KEY_VAULT_NAME,
    domains: DOMAINS.split(',').map(domain => domain.trim()),
    sslCertificateKeyVaultName: KEY_VAULT_CERTIFICATE_NAME
  });
})().catch(err => {
  console.error(err);
  process.exit(-1);
});
