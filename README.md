# acme-http-01-azure-key-vault-middleware

Use [Let's Encrypt](https://letsencrypt.org/) and other [RFC 8555](https://tools.ietf.org/html/rfc8555) providers **_natively and securely_** on Azure.

We use popular and high-quality industry standard libraries: [`node-fetch`](https://npmjs.com/package/node-fetch), [`node-forge`](https://npmjs.com/package/node-forge), [`@azure/keyvault-*`](https://npmjs.com/package/keyvault-certificates).

# Why another ACME middleware?

Unlike [Greenlock](https://npmjs.com/package/greenlock), the whole operation is done over Azure Key Vault. It gives us a few benefits:

- [Inexpensive](#inexpensive)
- [Easy to set up](#easy-to-set-up)
- [Minimal access rights to Key Vault](#minimal-access-rights-to-key-vault)
- [Minimal code on middleware](#minimal-code-on-middleware)
- [Secure by default: no database, file system, or other form of storage](#secure-by-default-no-database-file-system-or-other-form-of-storage)

## Inexpensive

Estimated cost for Azure Key Vault on each certificate issued by [Let's Encrypt](https://letsencrypt.org/) is less than USD 0.10 per month.

## Easy to set up

The solution is cloud native and easy to set up.

1. Set up Azure Key Vault
1. Install the middleware
1. Run enrollment agent periodically
1. Bind the SSL certificate to your Azure Web Apps

## Minimal access rights to Key Vault

Designed to separate access rights for highly secure systems.

| Role             | Key       | Secrets  | Certificates |
| ---------------- | --------- | -------- | ------------ |
| Enrollment agent | Get, Sign | Get, Set | Import       |
| Web server       |           | Get      |              |

## Minimal code on middleware

The middleware is only used to _statically serve_ responses generated by the enrollment agent. It do not have access to the ACME account credentials.

If you are not on [Express](https://expressjs.com/), you can consider porting it to the platform of your choice. It is [about 70 lines only](https://github.com/compulim/acme-http-01-azure-key-vault-middleware/blob/main/src/middleware/express.js).

## Secure by default: no database, file system, or other form of storage

We are using Azure Key Vault for storing the certificate and ACME challenges. It is designed to store certificates securely and integrates seamlessly with other Azure services.

You can use the certificates on Azure Functions and [ZIP file deployment on Azure Web Apps](https://docs.microsoft.com/en-us/azure/app-service/deploy-zip). ZIP file deployment disable access to local file system, which improves security and reduce deployment time.

# Set up

1. Set up Azure Key Vault
   1. [Create a new Azure Key Vault](#create-a-new-azure-key-vault)
   1. [Setup ACME account key](#set-up-an-account-key-for-your-acme-provider)
   1. [Create Service Principal Names](#create-service-principal-names)
   1. [Assign access policies to Service Principal Names](#assign-access-policies-to-service-principal-names)
1. Attaching the Express middleware
   1. [Set up environment variables in Azure Web Apps](#set-up-environment-variables-in-azure-web-apps)
   1. [Install NPM packages](#install-npm-packages)
   1. [Enable custom domain](#enable-custom-domain)
1. [Running enrollment agent](#running-enrollment-agent)
1. [Setting up SSL bindings on Azure Web Apps](#setting-up-ssl-bindings-on-azure-web-apps)

## Create a new Azure Key Vault.

> It is recommended to set up a new Azure Key Vault resource for each certificate.

Visit https://portal.azure.com/#create/Microsoft.KeyVault to create a new Azure Key Vault.

## Set up an account key for your ACME provider

On your Azure Key Vault, generate or import a key to use with your ACME provider. For Let's Encrypt, it support key algorithm EC P-256.

You can follow [this article](https://docs.microsoft.com/en-us/azure/key-vault/keys/quick-create-portal#add-a-key-to-key-vault) to add a key.

## Create Service Principal Names

Create SPNs using Azure CLI. `az` is preinstalled on [Azure Cloud Shell](https://docs.microsoft.com/en-us/cli/azure/get-started-with-azure-cli#install-or-run-in-azure-cloud-shell) and can be accessed using Azure Portal or [Windows Terminal](https://www.microsoft.com/en-us/p/windows-terminal/9n0dx20hk701).

```sh
az ad sp create-for-rbac -n http://mydomain.com/acme-enrollment-agent --skip-assignment
az ad sp create-for-rbac -n http://mydomain.com/acme-web-server --skip-assignment
```

> These steps are from [this article](https://docs.microsoft.com/en-us/cli/azure/create-an-azure-service-principal-azure-cli#create-a-service-principal).

## Assign access policies to Service Principal Names

On your Azure Key Vault, add access policies for each SPNs. Follow [this article](https://docs.microsoft.com/en-us/azure/key-vault/general/assign-access-policy-portal) to assign new access policies.

| SPN                                         | Key       | Secrets  | Certificates |
| ------------------------------------------- | --------- | -------- | ------------ |
| `http://mydomain.com/acme-enrollment-agent` | Get, Sign | Get, Set | Import       |
| `http://mydomain.com/acme-web-server`       |           | Get      |              |

> Get certificates access of enrollment agent is optional and is for expiry check only.

## Using the middleware

You can use the SSL certificate on any services supported by Azure Key Vault. For simplicity, we are setting it up on [Express](https://expressjs.com/) hosted on Azure Web Apps.

### Set up environment variables in Azure Web Apps

Set the following [environment variables on your Azure Web Apps](https://docs.microsoft.com/en-us/azure/app-service/configure-common) resource. This is the credential for SPN `http://mydomain.com/acme-web-server`.

```
AZURE_CLIENT_ID=12345678-1234-5678-abcd-12345678abcd
AZURE_CLIENT_SECRET=12345678-1234-5678-abcd-12345678abcd
AZURE_TENANT_ID=12345678-1234-5678-abcd-12345678abcd
KEY_VAULT_NAME: my-key-vault
```

> If you prefer to use other forms for authentication, such as certificate-based credential, you can refer to [this article](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/identity/identity/README.md#environment-variables) for details.

### Install NPM packages

Install both [`@azure/identity`](https://npmjs.com/package/@azure/identity) and [`acme-http-01-azure-key-vault-middleware`](https://npmjs.com/package/acme-http-01-azure-key-vault-middleware) package.

```sh
npm install @azure/identity acme-http-01-azure-key-vault-middleware
```

In your Express, attach the middleware. It will mount to all `GET` requests to `/.well-known/acme-challenge/`.

```js
const { DefaultAzureCredential } = require('@azure/identity');
const createACMEMiddleware = require('acme-http-01-azure-key-vault-middleware/express');

app.use(
  createACMEMiddleware({
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: process.env.KEY_VAULT_NAME
  })
);
```

> Optionally, you can pass a `rateLimiter` option for [throttling requests](#throttling-requests). By default, the middleware will throttle at a rate of 10 requests per second and 100 requests per 5 minutes.

### Enable custom domain

Follow [this article](https://docs.microsoft.com/en-us/azure/app-service/manage-custom-dns-buy-domain#map-app-service-domain-to-your-app) to add your custom domain to your Azure Web Apps.

## Running enrollment agent

> To avoid rate-limiting by your SSL provider, you should not order new certificate more than once a week. Let's Encrypt allows [50 certificates per registered domain per week](https://letsencrypt.org/docs/rate-limits/).

You should run the enrollment steps periodically in your scheduler, such as [`cron`](https://en.wikipedia.org/wiki/Cron) or [GitHub Actions](https://github.com/features/actions).

Before running the enrollment agent, set the following environment variables. This is the credential for SPN `http://mydomain.com/acme-enrollment-agent`.

```
ACME_ACCOUNT_CONTACT=mailto:johndoe@mydomain.com
ACME_ACCOUNT_TOS_AGREED=1
ACME_DIRECTORY_URL=https://acme-v02.api.letsencrypt.org/directory

AZURE_CLIENT_ID=12345678-1234-5678-abcd-12345678abcd
AZURE_CLIENT_SECRET=12345678-1234-5678-abcd-12345678abcd
AZURE_TENANT_ID=12345678-1234-5678-abcd-12345678abcd

KEY_VAULT_ACME_ACCOUNT_KEY_NAME=my-acme-key
KEY_VAULT_CERTIFICATE_NAME=my-ssl-certificate
KEY_VAULT_NAME=my-key-vault

DOMAINS=mydomain.com,myanotherdomain.com
```

> For testing purpose, you should order it from https://acme-staging-v02.api.letsencrypt.org/directory instead.

Then, run:

```sh
npx -p acme-http-01-azure-key-vault-middleware order
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

## Setting up SSL bindings on Azure Web Apps

After the first SSL certificate is uploaded to Azure Key Vault, you can start using it in your Azure Web Apps. Follow this tutorial to enable SSL on web app.

https://docs.microsoft.com/en-us/azure/app-service/configure-ssl-certificate#import-a-certificate-from-key-vault

# Going production

Here is a non-exhaustive list of things your team should consider when adopting this package in your production environment.

As always, when deploying code to production environment, your team should always perform a code review on libraries produced by third parties.

## Throttling requests

HTTP-01 challenge requires public `GET` request to `/.well-known/acme-challenge/`. And every `GET` request to this endpoint will trigger an Azure Key Vault operation.

By default, we use [`rate-limiter-flexible`](https://npmjs.com/package/rate-limiter-flexible) with memory-based bursty throttling, up to 50 requests per second and 100 requests per 5 minutes. If spam attack occurs at extreme rate, it will charge about USD 3 per month per server (based on Azure Key Vault pricing at the time of this writing, USD 0.03/10,000 operations).

You can configure throttling by passing your own `RateLimiter` object.

```js
const { BurstyRateLimiter, RateLimiterMemory } = require('rate-limiter-flexible');

app.use(
  createACMEMiddleware({
    azureCredential: new DefaultAzureCredential(),
    azureKeyVaultName: 'my-key-vault',
    rateLimiter: new BurstyRateLimiter(
      new RateLimiterMemory({
        duration: 300,
        points: 100
      }),
      new RateLimiterMemory({
        duration: 1,
        points: 50
      })
    )
  })
);
```

To disable throttling, pass a falsy value to `rateLimiter` option.

## Allow-listing IP addresses

If your SSL provider publish IP addresses of their HTTP-01 challengers, you should allow-list them to reduce attack surface.

## Logging

You may want to log all requests made to `/.well-known/acme-challenge/` for monitoring this attack surface.

# Contributing

(TBD)
