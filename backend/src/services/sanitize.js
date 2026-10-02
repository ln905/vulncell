const sanitizeHtml = require('sanitize-html');

// Nội dung report/comment là Markdown (text thuần).
// Tầng server: loại bỏ TOÀN BỘ thẻ HTML thô trước khi lưu (chống stored XSS).
// Tầng client: react-markdown (mặc định không render HTML thô) + rehype-sanitize.
const STRIP_ALL_HTML = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  // script/style/... bị xoá cả phần nội dung bên trong
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

function sanitizeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, STRIP_ALL_HTML);
}

function sanitizePlainText(text) {
  if (typeof text !== 'string') return text;
  return sanitizeHtml(text, STRIP_ALL_HTML).trim();
}

module.exports = { sanitizeMarkdown, sanitizePlainText };
