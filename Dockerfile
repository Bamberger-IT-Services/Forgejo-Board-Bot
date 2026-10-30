# Forgejo-Board-Bot – keine npm-Abhängigkeiten, nur Node.js.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src

USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "src/main.js"]
