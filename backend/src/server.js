require('dotenv').config();
const app = require('./app');
const { connectRedis } = require('./redis');

const PORT = process.env.PORT || 4000;

// Redis chạy nền, KHÔNG chặn server khởi động (connectRedis trả về ngay).
connectRedis();

app.listen(PORT, () => {
  console.log(`VulnCell API running on http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[!] Port ${PORT} đang bị tiến trình khác chiếm (server cũ chưa dừng).`);
    console.error('    Cách xử lý:');
    console.error('      - Dừng server cũ: bấm Ctrl+C ở cửa sổ đang chạy nó, hoặc');
    console.error('      - Chạy:  npm run kill:api   (từ thư mục gốc project)');
    process.exit(1);
  }
  throw err;
});
