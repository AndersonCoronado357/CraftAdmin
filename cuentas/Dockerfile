FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
COPY publico ./publico
COPY descargas ./descargas
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
