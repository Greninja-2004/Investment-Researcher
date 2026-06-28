FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

EXPOSE 3000

# Start Next.js server in production
CMD ["npm", "run", "start"]
