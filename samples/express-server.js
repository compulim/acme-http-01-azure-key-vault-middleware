require('dotenv/config');

const { PORT = 80 } = process.env;

const app = require('express')();
const { DefaultAzureCredential } = require('@azure/identity');

const createACMEMiddleware = require('acme-http-01-azure-key-vault-middleware/express');

app.use(
  createACMEMiddleware({
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: process.env.KEY_VAULT_NAME
  })
);

app.get('/health.txt', (_, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Listening to port ${PORT}`);
});
