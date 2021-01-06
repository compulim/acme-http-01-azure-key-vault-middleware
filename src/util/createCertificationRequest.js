const forge = require('node-forge');

module.exports = async function createCertificationRequest(forgeKeyPairs, domains) {
  const { privateKey, publicKey } = forgeKeyPairs;
  const csr = forge.pki.createCertificationRequest();

  csr.publicKey = publicKey;
  csr.setSubject([
    {
      name: 'commonName',
      value: domains[0]
    }
  ]);

  domains.length > 1 &&
    csr.setAttributes([
      {
        name: 'extensionRequest',
        extensions: [
          {
            name: 'subjectAltName',
            altNames: domains.slice(1).map(value => ({
              type: 2,
              value
            }))
          }
        ]
      }
    ]);

  // TODO: If we can use Azure Key Vault to sign this CSR, we can keep private key while rotating SSL certificate.
  csr.sign(privateKey);

  const csrInASN1 = forge.pki.certificationRequestToAsn1(csr);
  const csrInDER = forge.asn1.toDer(csrInASN1).getBytes();

  return Buffer.from(csrInDER, 'binary');
};
