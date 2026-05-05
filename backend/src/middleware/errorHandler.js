/**
 * Global async error wrapper — wraps controller functions so we don't
 * need try/catch in every controller. Passes errors to Express error handler.
 * Usage: router.post('/', asyncHandler(myController))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global Express error handling middleware.
 * Must be registered LAST in server.js (after all routes).
 */
const errorHandler = (err, req, res, next) => {
  console.error(`❌ [${req.method}] ${req.path} →`, err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, error: messages.join(', ') });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  // Gemini API errors
  if (err.message && err.message.includes('API_KEY')) {
    return res.status(500).json({
      success: false,
      error: 'AI service configuration error. Check GEMINI_API_KEY.',
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
};

module.exports = { asyncHandler, errorHandler };
