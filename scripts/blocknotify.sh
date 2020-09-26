#!/bin/sh
cd $(dirname "$0")/..
npm run sync >/dev/null 2>&1
