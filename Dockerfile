# syntax=docker/dockerfile:1.7

FROM node:24.13.0-bookworm-slim AS base
ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY package.json package-lock.json ./
COPY next.config.ts ./next.config.ts
COPY public ./public
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
EXPOSE 3000
CMD ["npm", "run", "start"]
