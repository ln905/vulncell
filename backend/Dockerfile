# Backend VulnCell — Node 22 + Prisma
FROM node:22-bookworm-slim

# Prisma cần openssl trên Debian slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Cần cho prisma generate + migrate deploy lúc chạy
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

# Ảnh anonymous mặc định cho GET /users/:username/avatar khi user chưa upload
COPY public ./public

EXPOSE 4000

# Khi container khởi động: áp migration -> seed demo (idempotent: bỏ qua nếu đã có report) -> chạy server
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
