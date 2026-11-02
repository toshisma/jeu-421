FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
# Base des comptes : monter un disque persistant sur /data (volume Railway, Docker -v, etc.).
ENV DATABASE_PATH=/data/421.sqlite
CMD ["npm", "start"]
