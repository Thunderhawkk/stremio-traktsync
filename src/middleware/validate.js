const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse({ body: req.body, params: req.params, query: req.query });
      req.validated = parsed;
      next();
    } catch (e) {
      if (e instanceof ZodError) return res.status(400).json({ error: 'validation_error', details: e.issues });
      next(e);
    }
  };
}

module.exports = { validate };
