'use strict';
const chalk = require('chalk');

function printHuman(report, aiText) {
  const { headers, tech, meta, endpoints } = report;

  // meta
  if (meta.title || meta.description) {
    console.log(chalk.bold.cyan('\n=== Page ==='));
    if (meta.title) console.log(`  title:  ${meta.title}`);
    if (meta.description) console.log(`  desc:   ${meta.description}`);
    if (meta.language) console.log(`  lang:   ${meta.language}`);
  }

  // headers
  console.log(chalk.bold.cyan('\n=== Security headers ==='));
  headers.forEach(h => {
    if (h.present) {
      console.log(chalk.green(`  ✓ ${h.header}`) + chalk.gray(`  ${String(h.value).slice(0, 70)}`));
    } else {
      console.log(chalk.yellow(`  ✗ ${h.header} `) + chalk.gray(`— missing; ${h.why}`));
    }
  });

  // tech
  console.log(chalk.bold.cyan('\n=== Tech fingerprint ==='));
  if (tech.length === 0) console.log(chalk.gray('  (none detected)'));
  else tech.forEach(t => console.log(`  • ${t}`));

  // endpoints
  console.log(chalk.bold.cyan('\n=== Endpoint surface ==='));
  console.log(`  links:   ${endpoints.links.length}`);
  console.log(`  scripts: ${endpoints.scripts.length}`);
  console.log(`  forms:   ${endpoints.forms.length}`);
  if (endpoints.forms.length) {
    endpoints.forms.slice(0, 8).forEach(f => {
      console.log(
        chalk.gray('    ') +
        chalk.cyan(f.method.padEnd(6)) +
        f.action +
        chalk.gray(` [${f.inputs.length} input${f.inputs.length === 1 ? '' : 's'}]`)
      );
    });
    if (endpoints.forms.length > 8) {
      console.log(chalk.gray(`    … +${endpoints.forms.length - 8} more`));
    }
  }

  // AI
  if (aiText) {
    console.log(chalk.bold.magenta('\n=== AI triage (Nemotron 3 Ultra) ===\n'));
    console.log(aiText);
  }

  console.log(
    chalk.gray(
      `\n  ${report.fetchedAt} · ${report.finalUrl}\n`
    )
  );
}

function toJson(report, aiText) {
  return JSON.stringify({ ...report, aiTriage: aiText }, null, 2);
}

module.exports = { printHuman, toJson };