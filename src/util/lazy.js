module.exports = function lazy(asyncFn) {
  let promise;

  return () => promise || (promise = asyncFn());
};
