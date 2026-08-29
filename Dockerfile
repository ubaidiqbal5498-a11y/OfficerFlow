FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
RUN npm ci --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3847
ENV HOST=0.0.0.0
ENV DATA_DIR=/var/data
EXPOSE 3847

CMD ["node", "server/index.js"]
