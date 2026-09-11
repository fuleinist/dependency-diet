export async function loadConfig(name) {
  const mod = await import('node:fs/promises');
  return mod.readFile(`config/${name}.json`, 'utf8');
}
