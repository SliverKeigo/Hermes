FROM oven/bun:1.1 AS base

WORKDIR /app

# Install only production deps using the lockfile
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the Bun-powered server
CMD ["bun", "start"]
