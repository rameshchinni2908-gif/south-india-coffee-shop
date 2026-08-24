FROM node:24-bookworm-slim

WORKDIR /workspace
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci && chown -R node:node /workspace

COPY --chown=node:node . .

USER node
EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "@south-india-coffee-shop/web", "--", "--host", "0.0.0.0"]
