#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

const { runRecon } = require('./src/recon');
const { aiTriage } = require('./src/ai');
const { loadScope } = require('./src/config');
const { isInScope } = require('./src/scope');
const { printHuman, toJson } = require('./src/format');

const VERSION = require('./package.json').version;

const BANNER = chalk.cyan(`
  ██╗  ██╗██╗   ██╗███╗   ██╗████████╗██╗  ██╗   ██╗
  ██║  ██║██║   ██║████╗  ██║╚══██╔══╝██║  ╚██╗ ██╔╝
  ███████║██║   ██║██╔██╗ ██║   ██║   ██║   ╚████╔╝
  ██╔══██║██║   ██║██║╚██╗██║   ██║   ██║    ╚██╔╝
  ██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝
  recon + ai triage  •  v${VERSION}  •  authorized targets only
`);

const program = new Command();

program
  .name('huntly')
  .description('Interactive recon + AI triage for authorized bug bounty testing')
  .version(VERSION)
  .argument('[url]', 'Target URL (must be in your authorized scope)')
  .option('-y, --yes', 'Skip authorization confirmation prompt')
  .option('--json', 'Emit JSON report to stdout (disables human formatting)')
  .option('--no-ai', 'Skip AI triage entirely')
  .option('--scope <path>', 'Path to scope file (default: ./.huntly-scope.json)')
  .addHelpText('after', `
Examples:
  $ huntly https://app.example.com
  $ huntly https://app.example.com -y
  $ huntly https://app.example.com --json > report.json
  $ huntly https://app.example.com --no-ai

Environment:
  NVIDIA_API_KEY    required for AI triage (get one at build.nvidia.com)
  NVIDIA_BASE_URL   optional, defaults to integrate.api.nvidia.com/v1
  NVIDIA_MODEL      optional, defaults to nvidia/nemotron-3-ultra-550b-a55b
`)
  .action(async (url, opts) => {
    if (!opts.json) console.log(BANNER);

    // 1. resolve target
    if (!url) {
      if (opts.json) {
        console.error('error: --json requires a URL argument');
        process.exit(2);
      }
      const a = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: 'Target URL:',
          validate: v =>
            /^https?:\/\//i.test(v.trim()) ? true : 'must start with http:// or https://',
        },
      ]);
      url = a.url.trim();
    } else {
      url = url.trim();
    }

    if (!/^https?:\/\//i.test(url)) {
      console.error(chalk.red(`error: invalid URL: ${url}`));
      process.exit(2);
    }

    // 2. scope validation
    const scopePath = opts.scope || '.huntly-scope.json';
    const scope = loadScope(scopePath);
    const scopeCheck = isInScope(url, scope);

    if (scope && !scopeCheck.ok) {
      console.error(
        chalk.red.bold('\n  ✗ OUT OF SCOPE\n') +
        chalk.red(`    ${scopeCheck.reason}\n`)
      );
      if (opts.json) process.exit(3);
      const c = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'force',
          message: chalk.red('Target is NOT in scope file. Continue anyway?'),
          default: false,
        },
      ]);
      if (!c.force) {
        console.log(chalk.gray('Aborted.'));
        process.exit(3);
      }
    } else if (scope && scopeCheck.ok) {
      console.log(
        chalk.green(`  ✓ in scope`) +
        chalk.gray(` (matched ${scopeCheck.matched}${scope.program ? `, program: ${scope.program}` : ''})`)
      );
    } else if (!scope) {
      console.log(
        chalk.gray(`  ℹ no scope file at ${scopePath} — proceeding with manual confirmation`)
      );
    }

    // 3. authorization confirmation
    if (!opts.yes && !opts.json) {
      const c = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'ok',
          message: chalk.yellow(`I confirm I am authorized to test ${url}.`),
          default: false,
        },
      ]);
      if (!c.ok) {
        console.log(chalk.red('Aborted — authorization required.'));
        process.exit(4);
      }
    }

    // 4. recon
    const report = await runRecon(url, { quiet: !!opts.json });
    if (!report) {
      console.error(chalk.red('error: recon failed'));
      process.exit(5);
    }

    // 5. AI triage
    let aiText = null;
    if (opts.ai !== false) {
      if (!process.env.NVIDIA_API_KEY) {
        if (!opts.json) {
          console.log(
            chalk.gray('\n  ℹ NVIDIA_API_KEY not set — skipping AI triage (set it to enable)\n')
          );
        }
      } else {
        try {
          const spinner = opts.json ? null : ora('Nemotron triaging findings...').start();
          aiText = await aiTriage(report);
          spinner?.succeed('AI triage complete');
        } catch (e) {
          if (!opts.json) console.log(chalk.yellow(`  ⚠ AI triage failed: ${e.message}`));
        }
      }
    }

    // 6. output
    if (opts.json) {
      process.stdout.write(toJson(report, aiText) + '\n');
    } else {
      printHuman(report, aiText);
    }
  });

program.parseAsync(process.argv).catch(err => {
  console.error(chalk.red(`fatal: ${err.message}`));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});