# Using in Azure Functions

You can use this package inside Azure Functions.

## Set up

- [Install NPM packages](#install-npm-packages)
- [Add environment variables](#set-environment-variables)
- [Set `routePrefix` on `host.json`](#set-routeprefix-on-host-json)
- [Add a new HTTP trigger](#add-a-new-http-trigger)

### Install NPM packages

Install both [`@azure/identity`](https://npmjs.com/package/@azure/identity) and [`acme-http-01-azure-key-vault-middleware`](https://npmjs.com/package/acme-http-01-azure-key-vault-middleware) package.

```sh
npm install @azure/identity acme-http-01-azure-key-vault-middleware
```

### Add environment variables

Add the following [environment variables to your Azure Functions](https://docs.microsoft.com/en-us/azure/azure-functions/functions-how-to-use-azure-function-app-settings?tabs=portal#settings) resource. This is the credential for SPN `http://mydomain.com/acme-web-server`.

```
AZURE_CLIENT_ID=12345678-1234-5678-abcd-12345678abcd
AZURE_CLIENT_SECRET=12345678-1234-5678-abcd-12345678abcd
AZURE_TENANT_ID=12345678-1234-5678-abcd-12345678abcd
KEY_VAULT_NAME: my-key-vault
```

### Set `routePrefix` on `host.json`

You will need to set HTTP trigger `routePrefix` to `""`. This is because the ACME challenge need to be served from `/.well-known/acme-challenge/` route, which is outside of the default `/api/` prefix.

### Add a new HTTP trigger

Copy the content of `AcmeChallengeTrigger` directory to your Azure Functions.

This trigger will handle all traffic to `/.well-known/acme-challenge/`.
