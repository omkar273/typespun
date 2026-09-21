#!/usr/bin/env node
// @ts-nocheck

import { run } from './cli-shim.js';

process.exitCode = await run(process.argv.slice(2));
