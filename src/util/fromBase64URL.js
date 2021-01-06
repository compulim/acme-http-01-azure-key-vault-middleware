module.exports = function fromBase64URL(base64) {
  return Buffer.from(base64.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64');
};
