#!/bin/sh
# Команда сборки для Cloudflare Workers Builds: кладёт файлы приложения в public/, откуда их отдаёт Worker
set -e
mkdir -p public/shell public/m
cp index.html rules.json public/
cp app/main.js app/preload.js app/hwid.js public/shell/
cp app/icon.png public/shell/
cp app/icon.ico public/shell/
# сайт для телефона (/m/): то же приложение + теги для «На экран Домой», иконки, манифест и service worker
sed -e '1r web/head.html' index.html > public/m/index.html
cp web/manifest.webmanifest web/sw.js web/icon-180.png web/icon-192.png web/icon-512.png public/m/
APP=$(grep -o "APP_VERSION = '[^']*'" index.html | head -1 | cut -d"'" -f2)
SH=$(grep -o "SHELL_VERSION = '[^']*'" app/main.js | head -1 | cut -d"'" -f2)
printf '{"app":"%s","shell":"%s"}' "$APP" "$SH" > public/ver.json
