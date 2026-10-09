FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip ffmpeg make g++

RUN python3 -m pip install --no-cache-dir --break-system-packages "yt-dlp[default]==2026.8.19"

COPY package*.json ./

RUN npm ci

COPY . .

RUN mkdir -p data && npm run build

CMD ["npm", "start"]
