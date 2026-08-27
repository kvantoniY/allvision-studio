import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@allvision/shared'],
  experimental: {
    cpus: 1,
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  // Konva тянет пакет canvas для отрисовки на сервере. Холст живёт только в браузере,
  // поэтому на сборке серверного бандла этот импорт отключаем — иначе Next падает
  // на 'Can't resolve canvas'.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'fastly.picsum.photos',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/static/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '4000',
        pathname: '/static/**',
      },
      {
        protocol: 'https',
        hostname: 'allvision-pulse.ru',
        pathname: '/static/**',
      },
      {
        protocol: 'https',
        hostname: 'www.allvision-pulse.ru',
        pathname: '/static/**',
      },
    ],
  },
};

export default nextConfig;
