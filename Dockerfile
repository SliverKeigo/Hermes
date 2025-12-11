FROM oven/bun:1.1 AS base

WORKDIR /app

COPY package.json ./
# 忽略安裝腳本以避免缺失 husky 等開發依賴
RUN bun install --production --ignore-scripts

# Copy application source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the Bun-powered server
CMD ["bun", "start"]
