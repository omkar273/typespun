#!/usr/bin/env node

import { run } from './cli-shim.js';

process.exitCode = await run(process.argv.slice(2));
