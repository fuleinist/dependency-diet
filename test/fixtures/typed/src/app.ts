import React from 'react';
import { readFile } from 'node:fs/promises';

export async function App(): Promise<React.ReactElement> {
  const version = await readFile('package.json', 'utf8');
  return React.createElement('div', null, version.length);
}
