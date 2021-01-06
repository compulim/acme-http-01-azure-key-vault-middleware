module.exports = function createAzureKeyVaultURL(azureKeyVaultName) {
  return azureKeyVaultName.startsWith('http') ? azureKeyVaultName : `https://${azureKeyVaultName}.vault.azure.net`;
};
