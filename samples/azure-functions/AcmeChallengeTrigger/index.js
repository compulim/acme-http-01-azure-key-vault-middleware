const { DefaultAzureCredential } = require('@azure/identity');

module.exports = require('acme-http-01-azure-key-vault-middleware/azure-functions')({
  azureCredential: new DefaultAzureCredential(),
  azureKeyVaultName: process.env.KEY_VAULT_NAME
});
