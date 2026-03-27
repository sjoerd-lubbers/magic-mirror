FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache espeak-ng ffmpeg

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
