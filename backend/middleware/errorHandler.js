function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.upstreamResponse) {
    console.error('Upstream response:', {
      status: err.upstreamStatus,
      message: err.publicMessage,
      requestId: err.upstreamResponse.requestId,
      refId: err.upstreamResponse.data && err.upstreamResponse.data.refId,
      error: err.upstreamResponse.error,
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.publicMessage || err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
