#!/bin/bash
# Serves the site locally: http://localhost:8080
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server 8080
elif command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer 8080
else
  docker run -d --rm -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
  echo "Served via Docker at http://localhost:8080"
  docker attach "$(docker ps -q | head -1)"
fi
