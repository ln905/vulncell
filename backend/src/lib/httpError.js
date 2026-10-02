// Lỗi có status HTTP — ném ở service/route, được bắt bởi error handler trong app.js
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
