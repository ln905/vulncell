// Chạy schema zod trên req.body; sai -> 400 kèm message lỗi đầu tiên.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return res.status(400).json({ error: `${path}${issue.message}` });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
