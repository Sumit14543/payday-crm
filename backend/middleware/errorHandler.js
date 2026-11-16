function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV === 'production') console.error({ error: err.name || 'Error', code: /^[A-Z0-9_]+$/.test(err.code || '') ? err.code : undefined, status: err.statusCode || 500 });
  else console.error(err);
  if (process.env.NODE_ENV !== 'production' && err.upstreamResponse) {
    console.error('Upstream response:', {
      status: err.upstreamStatus,
      message: err.publicMessage,
      requestId: err.upstreamResponse.requestId,
      refId: err.upstreamResponse.data && err.upstreamResponse.data.refId,
      error: err.upstreamResponse.error,
    });
  }

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // For 500 errors, never leak internal database or system error messages to client in production
  let clientMessage = err.publicMessage;
  if (!clientMessage) {
    if (statusCode < 500) {
      clientMessage = err.message || 'Invalid request';
    } else {
      clientMessage = isProduction ? 'An unexpected error occurred. Please try again later.' : (err.message || 'Internal server error');
    }
  }

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
  });
}

module.exports = errorHandler;
