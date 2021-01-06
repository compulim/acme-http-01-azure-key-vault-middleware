# acme-http-01-azure-key-vault-middleware

This Express middleware will handle ACME HTTP-01 challenge response as defined in [RFC 8555](https://tools.ietf.org/html/rfc8555) via Azure Key Vault.

It also offers a simple CLI to order a certificate from ACME provider, e.g. [Let's Encrypt](https://letsencrypt.org/).

We use high-quality industry standard libraries when handling PKI: [`node-fetch`](https://npmjs.com/package/node-fetch), [`node-forge`](https://npmjs.com/package/node-forge), [`@azure/keyvault-*`](https://npmjs.com/package/keyvault-certificates).

## Why another ACME middleware?

Unlike [Greenlock](https://npmjs.com/package/greenlock), the whole operation is done over Azure Key Vault. It gives us a few benefits:

- Easy to deploy SSL certificates to Azure Web Apps
- Support [ZIP file deployment on Azure Web Apps](https://docs.microsoft.com/en-us/azure/app-service/deploy-zip) out-of-box
   - ZIP deployed website has no write access to file system
   - Improve security
   - Support serverless environment
- No read/write to file system is required

## Why this package is interesting?

This package has a few focii:

- [Easy to set up](easy-to-set-up)
- [Minimal access rights to Key Vault](minimal-access-rights-to-key-vault)
- [Minimal code on Express middleware](minimal-code-on-express-middleware)
- [No file system read/write](no-file-system-read-write)
- [Only Azure Key Vault is needed, no blob storage](only-azure-key-vault-is-needed-no-blob-storage)

### Easy to set up

Do three things:

1. Set up Azure Key Vault with 2 SPNs
1. Install middleware to Express
1. Run `.bin/acme-order` periodically with your scheduler, such as GitHub Action

### Minimal access rights to Key Vault

Two separate Service Principal Names (SPN) is recommended for managing Key Vault access:

- SPN for web server (Express)
   - *Get* access to secrets, which contains responses of HTTP-01 challenges
- SPN for enrollment agent (CLI)
   - *Get* and *sign* access to key, for signing ACME requests and responding to challenges
   - *Set* access to secrets, for saving HTTP-01 challenge responses
   - *Import* access to certificates, for uploading a new certificate
   - Optional *get* access to certificates, for optional expiry check

### Minimal code on Express middleware

The Express middleware is only used to respond to HTTP-01 challenges, which is prepared by enrollment agent. This reduce attack surfaces.

If you are not on Node.js, you can consider porting it to the platform of your choice. It is [about 50 lines only](https://github.com/compulim/acme-http-01-azure-key-vault-middleware/blob/main/src/index.js).

### No file system read/write

In some serverless environment, file system is not provided. For example, when deploying to an Azure Web App using ZIP or WAR file deployment, the file system become read-only.

### Only Azure Key Vault is needed, no blob storage

Although it is more efficient to use Azure blob storage for keeping HTTP-01 challenge responses, it will requires 2 separate resources and additional logistics.

To simplify set up, we prefer to keep the HTTP-01 responses in Azure Key Vault as secret. Since we are not accessing these responses frequently, the impact on billing should be negligible.

As an additional benefit, Azure Key Vault will automatically expire responses, which help improving security.

## Set up

### Create a new Azure Key Vault.

> You should set up a new Azure Key Vault to isolate data.

Visit https://portal.azure.com/#create/Microsoft.KeyVault.

### Set up an account key for your ACME provider

On your Azure Key Vault, generate or import a key to use with your ACME provider. For Let's Encrypt, it support key algorithm EC P-256.

### Create 2 SPNs

Run:

```sh
az ad sp create-for-rbac -n http://mydomain.com/acme-web-server-role --skip-assignment
az ad sp create-for-rbac -n http://mydomain.com/acme-enrollment-agent --skip-assignment
```

> Detailed steps at https://docs.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli#create-a-service-principal.

### Assign access policies to SPNs

On your Azure Key Vault, add 2 access policies.

For `http://mydomain.com/acme-web-server-role` SPN, it will need *get* access for *secrets*.

For `http://mydomain.com/acme-enrollment-agent` SPN, it will need:

- Key: get, sign
- Secret: set
- Certificate: import, and optional get

> If you would want your enrollment agent to check the validity of the certificate, you will need to add get access.

### Using the middleware

Set the following environment variables, this is used by `@azure/identity` package to create login credential:

```
AZURE_CLIENT_ID=12345678-1234-5678-abcd-12345678abcd
AZURE_CLIENT_SECRET=12345678-1234-5678-abcd-12345678abcd
AZURE_TENANT_ID=12345678-1234-5678-abcd-12345678abcd
```

> If you prefer to use other forms for authentication, you can refer to [`@azure/identity`](https://www.npmjs.com/package/@azure/identity) package for details.

Then, install the package.

```sh
npm install @azure/identity acme-http-01-azure-key-vault-middleware
```

In your Express, attach the middleware. It will mount itself to all `GET` requests at `/.well-known/acme-challenge/`.

```js
const { DefaultAzureCredential } = require('@azure/identity');
const createACMEMiddleware = require('acme-http-01-azure-key-vault-middleware');

app.use(
  createACMEMiddleware({
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: 'my-key-vault'
  })
);
```

### Running enrollment agent

> To avoid rate-limiting, you should not order new certificate more than once a week.

You should run the enrollment steps periodically in your scheduled job.

To order a new certificate, set the following environment variables:

```
ACME_ACCOUNT_CONTACT=mailto:johndoe@example.com
ACME_ACCOUNT_TOS_AGREED=1
ACME_DIRECTORY_URL=https://acme-v02.api.letsencrypt.org/directory

AZURE_CLIENT_ID=12345678-1234-5678-abcd-12345678abcd
AZURE_CLIENT_SECRET=12345678-1234-5678-abcd-12345678abcd
AZURE_TENANT_ID=12345678-1234-5678-abcd-12345678abcd

KEY_VAULT_ACME_ACCOUNT_KEY_NAME=my-acme-key
KEY_VAULT_CERTIFICATE_NAME=my-ssl-certificate
KEY_VAULT_NAME=my-key-vault

DOMAINS=mydomain.com
```

> When testing, you should order it from https://acme-staging-v02.api.letsencrypt.org/directory instead.

Then, run:

```sh
npx -p acme-http-01-azure-key-vault-middleware acme-order
```

If succeeded, you should see:

```
Creating or signing into ACME provider.
Creating a new certificate order.
Order created at https://acme-v02.api.letsencrypt.org/acme/order/12345678/23456789.
Preparing HTTP-01 challenge responses.
Waiting for order to become ready.
Order is ready for pickup (finalize) at https://acme-v02.api.letsencrypt.org/acme/finalize/12345678/34567890.
Downloading certificate from https://acme-v02.api.letsencrypt.org/acme/cert/1234567890abcdef1234567890abcdef12345678.
Certificate downloaded, serial number is 1234567890abcdef1234567890abcdef12345678 and will expires at 2021-01-01T12:34:56.789Z.
Uploading certificate to Azure Key Vault as "my-ssl-certificate".
Certificate uploaded to Azure Key Vault as "my-ssl-certificate".
```

### Azure Web App using SSL from Azure Key Vault

Follow this tutorial to enable SSL on Azure Web App with a certificate stored in Azure Key Vault.

https://docs.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault

## Order certificate through GitHub Action

You can use GitHub workflow to order a certificate periodically. This is a sample workflow file.

```yml
name: ACME Enrollment

on:
  schedule:
  - cron: '34 12 1 * *'

jobs:
  order:
    name: Order
    runs-on: ubuntu-latest

    steps:
      - uses: actions/setup-node@v1
        with:
          node-version: 12
      - run: npx -p acme-http-01-azure-key-vault-middleware acme-order
        env:
          AZURE_CLIENT_ID: ${{ secrets.ACME_ENROLLMENT_AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.ACME_ENROLLMENT_AZURE_CLIENT_SECRET }}
          AZURE_TENANT_ID: ${{ secrets.ACME_ENROLLMENT_AZURE_TENANT_ID }}

          ACME_ACCOUNT_CONTACT: mailto:johndoe@example.com
          ACME_ACCOUNT_TOS_AGREED: 1
          ACME_DIRECTORY_URL: https://acme-v02.api.letsencrypt.org/directory

          KEY_VAULT_ACME_ACCOUNT_KEY_NAME: my-acme-key
          KEY_VAULT_CERTIFICATE_NAME: my-ssl-certificate
          KEY_VAULT_NAME: my-key-vault

          DOMAINS: mydomain.com
```

## Going production

Here is a non-exhaustive list of things your team should consider when adopting this package in your production environment.

As always, when deploying code to production environment, your team should always perform a code review on libraries produced by third parties.

### Throttling requests

HTTP-01 challenge requires public `GET` request to `/.well-known/acme-challenge/`. And every `GET` request to this endpoint will trigger an Azure Key Vault operation.

You should consider adding throttling to this endpoint to prevent unexpected bill incurring.

### Logging

You may want to log all requests made to `/.well-known/acme-challenge/` for monitoring this attack surface.

# Contributing

(TBD)
