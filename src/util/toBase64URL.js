module.exports = function toBase64URL(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data);
  }

  return data.toString('base64').replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=*$/u, '');
};
