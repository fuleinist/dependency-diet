function makeColors(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return {
    bold: wrap(1),
    dim: wrap(2),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    cyan: wrap(36),
  };
}

function scoreColor(c, score) {
  if (score >= 90) return c.green;
  if (score >= 70) return c.yellow;
  return c.red;
}

export function formatText(report, { color = true } = {}) {
  const c = makeColors(color);
  const p = report.project;
  const lines = [];

  lines.push(c.bold(`dependency-diet — ${p.name || '(unnamed)'}`));
  lines.push(
    c.dim(
      `${p.dir} · ${p.dependencyCount} deps, ${p.devDependencyCount} devDeps · lockfile: ${p.lockfile || 'none'} · ${report.summary.scannedFiles} files scanned`
    )
  );

  for (const n of report.notes) lines.push(c.yellow(`note: ${n}`));

  lines.push('');
  if (report.unusedSkipped) {
    lines.push(c.dim('unused: skipped (no source files)'));
  } else if (report.unused.length === 0) {
    lines.push(`${c.green('✓')} no unused dependencies`);
  } else {
    lines.push(c.red(c.bold(`✗ unused dependencies (${report.unused.length})`)));
    for (const u of report.unused) {
      lines.push(`  ${c.red('✗')} ${c.bold(u.name)} ${c.dim(`[${u.section}]`)} — not imported or referenced in scripts/config · fix: ${c.cyan(`npm uninstall ${u.name}`)}`);
    }
  }

  lines.push('');
  if (report.duplicates.length === 0) {
    lines.push(`${c.green('✓')} no duplicate versions in lockfile`);
  } else {
    lines.push(c.yellow(c.bold(`⚠ duplicated packages (${report.duplicates.length})`)));
    for (const d of report.duplicates) {
      lines.push(
        `  ${c.yellow('⚠')} ${c.bold(d.name)} — ${d.versions.length} versions (${d.versions.join(', ')}) across ${d.occurrences} installs · fix: ${c.cyan('npm dedupe')} / align ranges`
      );
    }
  }

  lines.push('');
  if (report.heavy.length === 0) {
    lines.push(`${c.green('✓')} no heavy or deprecated packages from the knowledge base`);
  } else {
    lines.push(c.yellow(c.bold(`⚠ heavy / deprecated packages (${report.heavy.length})`)));
    for (const h of report.heavy) {
      const tag = h.deprecated ? c.red('[DEPRECATED] ') : '';
      lines.push(`  ${h.deprecated ? c.red('✗') : c.yellow('⚠')} ${tag}${c.bold(h.name)} — ~${h.approxKbMinGzip}KB min+gzip · swap: ${c.cyan(h.swap)}${h.note ? c.dim(` (${h.note})`) : ''}`);
    }
  }

  lines.push('');
  const s = report.summary;
  lines.push(
    `${scoreColor(c, s.score)(c.bold(`${s.score}/100`))} — ${s.unusedCount} unused, ${s.duplicateCount} duplicated, ${s.heavyCount} heavy in ${p.name || p.dir}`
  );

  return lines.join('\n');
}

export function formatJson(report) {
  return JSON.stringify(report, null, 2);
}
